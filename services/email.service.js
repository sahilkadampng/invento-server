const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

/**
 * Send email
 */
const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@invento.com',
      to,
      subject,
      html,
      attachments,
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error.message);
    return false;
  }
};

/**
 * Send low stock alert email
 */
const sendLowStockAlert = async (product, recipients) => {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #e74c3c;">⚠️ Low Stock Alert</h2>
      <p><strong>${product.name}</strong> (SKU: ${product.sku}) is running low.</p>
      <table style="border-collapse: collapse; margin-top: 10px;">
        <tr><td style="padding: 5px 15px; border: 1px solid #ddd;"><strong>Current Stock:</strong></td><td style="padding: 5px 15px; border: 1px solid #ddd;">${product.stockQty}</td></tr>
        <tr><td style="padding: 5px 15px; border: 1px solid #ddd;"><strong>Reorder Level:</strong></td><td style="padding: 5px 15px; border: 1px solid #ddd;">${product.reorderLevel}</td></tr>
      </table>
      <p style="margin-top: 15px; color: #666;">Please reorder this item soon.</p>
    </div>
  `;
  return sendEmail({ to: recipients, subject: `Low Stock Alert: ${product.name}`, html });
};

/**
 * Send invoice email with PDF attachment
 */
const sendInvoiceEmail = async (invoice, pdfBuffer) => {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Invoice ${invoice.invoiceNumber}</h2>
      <p>Dear ${invoice.customer.name},</p>
      <p>Please find your invoice attached.</p>
      <p><strong>Total Amount:</strong> ₹${invoice.totalAmount.toFixed(2)}</p>
      <p>Thank you for your business!</p>
    </div>
  `;
  const attachments = pdfBuffer ? [{
    filename: `${invoice.invoiceNumber}.pdf`,
    content: pdfBuffer,
    contentType: 'application/pdf',
  }] : [];

  return sendEmail({
    to: invoice.customer.email,
    subject: `Invoice ${invoice.invoiceNumber} from Invento`,
    html,
    attachments,
  });
};

module.exports = { sendEmail, sendLowStockAlert, sendInvoiceEmail };
