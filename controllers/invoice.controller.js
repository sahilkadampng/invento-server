const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const InventoryLog = require('../models/InventoryLog');
const { createAuditLog } = require('../services/audit.service');
const { emitEvent, EVENTS } = require('../services/socket.service');
const { sendInvoiceEmail } = require('../services/email.service');
const { generateDocNumber, getPaginationMeta } = require('../utils/helpers');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const { z } = require('zod');

const invoiceSchema = z.object({
    customer: z.object({
        name: z.string().min(1),
        email: z.string().email().optional().or(z.literal('')),
        phone: z.string().optional(),
        address: z.string().optional(),
        gstNumber: z.string().optional(),
    }),
    items: z.array(z.object({
        product: z.string().min(1),
        quantity: z.number().int().min(1),
        unitPrice: z.number().min(0),
        discount: z.number().min(0).optional(),
        tax: z.number().min(0).optional(),
    })).min(1),
    paymentMethod: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'other']).optional(),
    paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
});

const getInvoices = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, startDate, endDate, paymentStatus } = req.query;
        const filter = { ...req.warehouseFilter };
        if (paymentStatus) filter.paymentStatus = paymentStatus;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [invoices, total] = await Promise.all([
            Invoice.find(filter)
                .populate('items.product', 'name sku')
                .populate('createdBy', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Invoice.countDocuments(filter),
        ]);

        res.json({ success: true, data: { invoices, pagination: getPaginationMeta(total, parseInt(page), parseInt(limit)) } });
    } catch (error) { next(error); }
};

const getInvoice = async (req, res, next) => {
    try {
        const invoice = await Invoice.findOne({ _id: req.params.id, ...req.warehouseFilter })
            .populate('items.product', 'name sku barcode')
            .populate('createdBy', 'name');
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
        res.json({ success: true, data: { invoice } });
    } catch (error) { next(error); }
};

const createInvoice = async (req, res, next) => {
    try {
        const data = invoiceSchema.parse(req.body);
        const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

        // Populate item details and calculate totals
        let subtotal = 0;
        let taxAmount = 0;
        let discountAmount = 0;

        for (let i = 0; i < data.items.length; i++) {
            const product = await Product.findOne({ _id: data.items[i].product, warehouseId });
            if (!product) return res.status(404).json({ success: false, message: `Product not found: ${data.items[i].product}` });

            if (product.stockQty < data.items[i].quantity) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
            }

            data.items[i].name = product.name;
            data.items[i].sku = product.sku;

            const lineSubtotal = data.items[i].quantity * data.items[i].unitPrice;
            const discount = data.items[i].discount || 0;
            const tax = data.items[i].tax || 0;
            const discAmt = lineSubtotal * (discount / 100);
            const taxableAmt = lineSubtotal - discAmt;
            const taxAmt = taxableAmt * (tax / 100);
            data.items[i].total = taxableAmt + taxAmt;

            subtotal += lineSubtotal;
            discountAmount += discAmt;
            taxAmount += taxAmt;

            // Deduct stock
            const prevQty = product.stockQty;
            product.stockQty -= data.items[i].quantity;
            await product.save();

            await InventoryLog.create({
                product: product._id,
                warehouseId,
                type: 'out',
                quantity: data.items[i].quantity,
                previousQty: prevQty,
                newQty: product.stockQty,
                reason: 'Sale',
                performedBy: req.user._id,
            });
        }

        data.subtotal = subtotal;
        data.taxAmount = taxAmount;
        data.discountAmount = discountAmount;
        data.totalAmount = subtotal - discountAmount + taxAmount;
        data.invoiceNumber = await generateDocNumber(Invoice, 'INV', 'invoiceNumber');
        data.createdBy = req.user._id;
        data.warehouseId = warehouseId;

        const invoice = await Invoice.create(data);

        emitEvent(EVENTS.INVOICE_CREATED, { invoice: invoice._id, invoiceNumber: invoice.invoiceNumber });
        emitEvent(EVENTS.STOCK_UPDATED, { source: 'invoice', invoiceNumber: invoice.invoiceNumber });

        await createAuditLog({ user: req.user, action: 'create', entity: 'Invoice', entityId: invoice._id, changes: { after: invoice.toObject() }, req });

        res.status(201).json({ success: true, message: 'Invoice created', data: { invoice } });
    } catch (error) { next(error); }
};

/**
 * GET /api/invoices/:id/pdf — Generate PDF
 */
const generatePDF = async (req, res, next) => {
    try {
        const invoice = await Invoice.findOne({ _id: req.params.id, ...req.warehouseFilter }).populate('items.product', 'name sku');
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

        // Defensive defaults to avoid runtime errors on older/partial invoices
        if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Invoice has no items to render' });
        }

        const toNumber = (value, fallback = 0) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : fallback;
        };

        const formatMoney = (value) => `Rs. ${toNumber(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const paymentMethod = (invoice.paymentMethod || 'N/A').toString().toUpperCase();
        const paymentStatus = (invoice.paymentStatus || 'N/A').toString().toUpperCase();
        const customer = invoice.customer || {};
        const customerName = customer.name || 'Customer';
        const customerPhone = customer.phone || '';
        const customerEmail = customer.email || '';
        const customerGst = customer.gstNumber || '';
        const subtotal = toNumber(invoice.subtotal);
        const discountAmount = toNumber(invoice.discountAmount);
        const taxAmount = toNumber(invoice.taxAmount);
        const totalAmount = toNumber(invoice.totalAmount);

        const upiVpa = process.env.UPI_VPA || 'invento@upi';
        const upiName = process.env.UPI_NAME || 'Invento';
        const upiNote = `Invoice ${invoice.invoiceNumber}`;
        const upiUrl = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(upiName)}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(upiNote)}`;

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595, 842]); // A4
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Background panel
        page.drawRectangle({ x: 20, y: 20, width: 555, height: 802, color: rgb(0.98, 0.97, 0.94) });

        let y = 780;
        const marginLeft = 40;

        const drawText = (text, x, yPos, options = {}) => {
            page.drawText(text, { x, y: yPos, size: options.size || 10, font: options.bold ? boldFont : font, color: options.color || rgb(0, 0, 0) });
        };

        const drawLabelValue = (label, value, x, yPos, options = {}) => {
            drawText(label, x, yPos, { size: options.size || 9, color: rgb(0.35, 0.35, 0.35) });
            drawText(value, x, yPos - 12, { size: (options.size || 9) + 1, bold: true });
        };

        // Header
        drawText('INVENTO', marginLeft, y + 10, { size: 22, bold: true });
        drawText('INVOICE', 480, y + 10, { size: 16, bold: true, color: rgb(0.8, 0.1, 0.1) });
        drawText('Contact', 420, y - 6, { size: 9, color: rgb(0.35, 0.35, 0.35) });
        drawText('www.invento.com', 420, y - 18, { size: 9 });
        drawText('support@invento.com', 420, y - 30, { size: 9 });

        y -= 60;
        page.drawLine({ start: { x: marginLeft, y }, end: { x: 555, y }, thickness: 1 });

        // Invoice meta row
        y -= 20;
        drawLabelValue('Due Amount', formatMoney(totalAmount), marginLeft, y, { size: 10 });
        drawLabelValue('Due Date', new Date(invoice.createdAt).toLocaleDateString('en-IN'), marginLeft + 120, y, { size: 10 });
        drawLabelValue('Invoice #', invoice.invoiceNumber, marginLeft + 240, y, { size: 10 });
        drawLabelValue('Invoice Date', new Date(invoice.createdAt).toLocaleDateString('en-IN'), marginLeft + 360, y, { size: 10 });

        // Bill / Ship
        y -= 70;
        drawText('Bill To', marginLeft, y, { bold: true });
        drawText(customerName, marginLeft, y - 14, { size: 10 });
        if (customerAddressLine(customer)) {
            drawText(customerAddressLine(customer), marginLeft, y - 26, { size: 9 });
        }
        if (customerEmail) { drawText(customerEmail, marginLeft, y - 38, { size: 9 }); }
        if (customerPhone) { drawText(customerPhone, marginLeft, y - 50, { size: 9 }); }
        if (customerGst) { drawText(`GST: ${customerGst}`, marginLeft, y - 62, { size: 9 }); }

        drawText('Shipped To', marginLeft + 260, y, { bold: true });
        drawText(customerName, marginLeft + 260, y - 14, { size: 10 });
        if (customerAddressLine(customer)) {
            drawText(customerAddressLine(customer), marginLeft + 260, y - 26, { size: 9 });
        }

        y -= 90;
        page.drawLine({ start: { x: marginLeft, y }, end: { x: 555, y }, thickness: 0.8 });

        // Table header
        y -= 18;
        page.drawRectangle({ x: marginLeft, y: y - 4, width: 515, height: 16, color: rgb(0.9, 0.9, 0.9) });
        drawText('#', marginLeft + 4, y, { size: 9, bold: true });
        drawText('Desc. of Goods/Services', marginLeft + 20, y, { size: 9, bold: true });
        drawText('Qty.', marginLeft + 290, y, { size: 9, bold: true });
        drawText('Rate', marginLeft + 340, y, { size: 9, bold: true });
        drawText('Tax %', marginLeft + 400, y, { size: 9, bold: true });
        drawText('Total', marginLeft + 470, y, { size: 9, bold: true });

        // Table rows
        y -= 18;
        invoice.items.forEach((item, i) => {
            const quantity = toNumber(item.quantity, 0);
            const unitPrice = toNumber(item.unitPrice, 0);
            const itemTax = toNumber(item.tax, 0);
            const lineTotal = toNumber(item.total, unitPrice * quantity);

            drawText(`${i + 1}`, marginLeft + 4, y, { size: 9 });
            drawText((item.name || '').substring(0, 40), marginLeft + 20, y, { size: 9 });
            drawText(`${quantity}`, marginLeft + 300, y, { size: 9 });
            drawText(formatMoney(unitPrice), marginLeft + 340, y, { size: 9 });
            drawText(`${itemTax}%`, marginLeft + 410, y, { size: 9 });
            drawText(formatMoney(lineTotal), marginLeft + 460, y, { size: 9 });
            y -= 14;
        });

        // Totals and payment info
        y -= 10;
        page.drawLine({ start: { x: marginLeft, y }, end: { x: 555, y }, thickness: 0.8 });
        y -= 14;

        drawText('Payment Method', marginLeft, y, { bold: true, size: 10 });
        drawText(paymentMethod, marginLeft, y - 14, { size: 10 });

        drawText('Status', marginLeft, y - 30, { bold: true, size: 10 });
        drawText(paymentStatus, marginLeft, y - 44, { size: 10 });

        // Totals box
        drawText('Sub Total', marginLeft + 320, y, { size: 10 });
        drawText(formatMoney(subtotal), marginLeft + 430, y, { size: 10 });
        drawText('Discount', marginLeft + 320, y - 14, { size: 10 });
        drawText(formatMoney(discountAmount), marginLeft + 430, y - 14, { size: 10 });
        drawText('Tax', marginLeft + 320, y - 28, { size: 10 });
        drawText(formatMoney(taxAmount), marginLeft + 430, y - 28, { size: 10 });
        page.drawLine({ start: { x: marginLeft + 320, y: y - 36 }, end: { x: marginLeft + 480, y: y - 36 }, thickness: 0.8 });
        drawText('Total', marginLeft + 320, y - 48, { size: 11, bold: true });
        drawText(formatMoney(totalAmount), marginLeft + 430, y - 48, { size: 11, bold: true });

        y -= 90;
        page.drawLine({ start: { x: marginLeft, y }, end: { x: 555, y }, thickness: 0.8 });
        y -= 14;
        drawText('Accepted By', marginLeft, y, { bold: true });
        drawText(customerName, marginLeft, y - 16, { size: 10 });
        drawText('Signature', marginLeft + 320, y, { bold: true });
        drawText('Invento', marginLeft + 320, y - 16, { size: 10 });

        y -= 60;
        drawText('Payment Info', marginLeft, y, { bold: true });
        drawText(`UPI: ${upiVpa}`, marginLeft, y - 12, { size: 10 });
        drawText(`Account Name: ${upiName}`, marginLeft, y - 24, { size: 10 });
        drawText(`Note: ${upiNote}`, marginLeft, y - 36, { size: 10 });

        // QR Code block
        try {
            const qrDataUrl = await QRCode.toDataURL(upiUrl);
            const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
            const qrImage = await pdfDoc.embedPng(qrImageBytes);
            const qrSize = 96;
            page.drawImage(qrImage, {
                x: marginLeft + 360,
                y: y - qrSize + 12,
                width: qrSize,
                height: qrSize,
            });
            drawText('Scan to Pay (UPI)', marginLeft + 360, y - qrSize - 4, { size: 9 });
            drawText(`Amount: ${formatMoney(totalAmount)}`, marginLeft + 360, y - qrSize - 16, { size: 9 });
        } catch (qrErr) {
            console.error('QR generation failed', qrErr.message);
        }

        const pdfBytes = await pdfDoc.save();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        });
        res.send(Buffer.from(pdfBytes));
    } catch (error) { next(error); }
};

const customerAddressLine = (customer) => {
    const parts = [customer.address].filter(Boolean);
    return parts.length ? parts.join(', ') : '';
};

/**
 * POST /api/invoices/:id/email — Email invoice PDF to customer
 */
const emailInvoice = async (req, res, next) => {
    try {
        const invoice = await Invoice.findOne({ _id: req.params.id, ...req.warehouseFilter });
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
        if (!invoice.customer.email) return res.status(400).json({ success: false, message: 'Customer email not available' });

        // Generate PDF buffer
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595, 842]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const currencySymbol = 'Rs. ';
        page.drawText(`Invoice ${invoice.invoiceNumber} - Total: ${currencySymbol}${invoice.totalAmount.toFixed(2)}`, { x: 50, y: 790, size: 14, font });
        const pdfBytes = await pdfDoc.save();

        await sendInvoiceEmail(invoice, Buffer.from(pdfBytes));

        res.json({ success: true, message: 'Invoice emailed successfully' });
    } catch (error) { next(error); }
};

module.exports = { getInvoices, getInvoice, createInvoice, generatePDF, emailInvoice };
