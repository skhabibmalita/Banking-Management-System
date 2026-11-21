import PDFDocument from 'pdfkit';
import { formatINR, maskAccount } from '../utils/money.js';
import { Account } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { findVisibleTransaction } from './transaction.service.js';

const when = (d) => `${new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`;

// Streams a PDF receipt. Only completed transactions have one, and only people who can see the
// transaction can download it. Account numbers are masked.
export async function streamReceipt(customer, id, res) {
  const { txn } = await findVisibleTransaction(customer, id);
  if (txn.status !== 'completed') throw ApiError.conflict('Receipts are only available for completed transactions', { code: 'NOT_COMPLETED' });

  const [from, to] = await Promise.all([
    Account.findById(txn.accountId).select('accountNumber'),
    txn.counterpartyAccountId ? Account.findById(txn.counterpartyAccountId).select('accountNumber') : null,
  ]);

  const rows = [
    ['Reference', txn.reference],
    ['Date', when(txn.date)],
    ['Type', txn.type[0].toUpperCase() + txn.type.slice(1)],
    ['Status', 'Completed'],
    ['Amount', formatINR(txn.amount)],
    [txn.type === 'deposit' ? 'Credited to' : txn.type === 'withdrawal' ? 'Debited from' : 'From account', maskAccount(from?.accountNumber)],
    ...(to ? [['To account', maskAccount(to.accountNumber)]] : []),
    ['Note', txn.description || '-'],
  ];

  const doc = new PDFDocument({ size: 'A5', margin: 40, info: { Title: `Receipt ${txn.reference}`, Author: 'Northwind Bank' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${txn.reference}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0A1F44').text('Northwind Bank');
  doc.font('Helvetica').fontSize(11).fillColor('#5D7DB0').text('Transaction receipt');
  doc.moveDown(0.6).strokeColor('#C3D1E8').moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke().moveDown(0.8);
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(9).fillColor('#5D7DB0').text(label.toUpperCase());
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0A1F44').text(String(value)).moveDown(0.5);
  }
  doc.moveDown(0.5).font('Helvetica-Oblique').fontSize(8).fillColor('#93AACF')
    .text('Simulated transaction for an academic project. No real money moved.');
  doc.end();
}
