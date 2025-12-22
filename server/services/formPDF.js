/**
 * PDF Generation Service for Form Submissions
 * 
 * Generates professional PDF documents from form submissions
 * using PDFKit. Handles both conversion and intake forms
 * with appropriate PHI handling.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query, getClient } from '../db.js';

const PDF_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads', 'form-pdfs');

// Ensure PDF directory exists
async function ensurePDFDir() {
  await fs.mkdir(PDF_DIR, { recursive: true });
}

/**
 * Generate PDF from a form submission
 */
export async function generateSubmissionPDF({ submissionId, generatedBy }) {
  await ensurePDFDir();

  const client = await getClient();
  
  try {
    // Fetch submission with form details
    const { rows } = await client.query(`
      SELECT 
        s.*,
        f.name as form_name,
        f.form_type,
        f.description as form_description,
        fv.version_number
      FROM form_submissions s
      JOIN forms f ON s.form_id = f.id
      JOIN form_versions fv ON s.form_version_id = fv.id
      WHERE s.id = $1
    `, [submissionId]);

    if (!rows.length) {
      throw new Error('Submission not found');
    }

    const submission = rows[0];
    const isIntake = submission.form_type === 'intake';

    // Get payload (decrypt if needed for intake forms)
    let payload = {};
    if (isIntake && submission.encrypted_payload) {
      // In production: decrypt using proper KMS
      // For now, return placeholder for PHI
      payload = { _note: 'PHI data - requires decryption' };
    } else if (submission.non_phi_payload) {
      payload = submission.non_phi_payload;
    }

    // Generate unique filename
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `submission_${submissionId.slice(0, 8)}_${timestamp}_${hash}.pdf`;
    const filepath = path.join(PDF_DIR, filename);

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `${submission.form_name} - Submission`,
        Author: 'Anchor Forms',
        Subject: `Form submission from ${new Date(submission.created_at).toLocaleDateString()}`,
        Creator: 'Anchor Dashboard'
      }
    });

    // Create write stream
    const writeStream = createWriteStream(filepath);
    
    doc.pipe(writeStream);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text(submission.form_name, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').fillColor('#666666')
       .text(`${isIntake ? 'Intake Form' : 'Contact Form'} Submission`, { align: 'center' });
    doc.moveDown(1);

    // Submission info box
    doc.rect(50, doc.y, 495, 60).fill('#f5f5f5');
    doc.fillColor('#333333').fontSize(10);
    const infoY = doc.y + 10;
    doc.text(`Submission ID: ${submissionId.slice(0, 8)}...`, 60, infoY);
    doc.text(`Date: ${new Date(submission.created_at).toLocaleString()}`, 60, infoY + 15);
    doc.text(`Form Version: v${submission.version_number}`, 60, infoY + 30);
    doc.text(`Type: ${submission.submission_kind}`, 300, infoY);
    if (submission.embed_domain) {
      doc.text(`Source: ${submission.embed_domain}`, 300, infoY + 15);
    }
    doc.moveDown(4);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e0e0e0');
    doc.moveDown(1);

    // Form Data Section
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333333')
       .text('Submission Data');
    doc.moveDown(0.5);

    if (isIntake) {
      // PHI warning for intake forms
      doc.rect(50, doc.y, 495, 40).fill('#fff3e0');
      doc.fillColor('#e65100').fontSize(10)
         .text('⚠ PROTECTED HEALTH INFORMATION', 60, doc.y + 10, { continued: false });
      doc.fillColor('#666666').fontSize(9)
         .text('This document contains PHI and must be handled in accordance with HIPAA regulations.', 60, doc.y + 25);
      doc.moveDown(3);
    }

    // Render form fields
    doc.fillColor('#333333').fontSize(11);
    let fieldY = doc.y;

    Object.entries(payload).forEach(([key, value], index) => {
      if (fieldY > 700) {
        doc.addPage();
        fieldY = 50;
      }

      // Field label
      const label = formatFieldLabel(key);
      doc.font('Helvetica-Bold').text(label + ':', 50, fieldY);
      
      // Field value
      const valueStr = formatFieldValue(value);
      doc.font('Helvetica').text(valueStr, 200, fieldY, { width: 345 });
      
      // Calculate height based on value length
      const valueHeight = doc.heightOfString(valueStr, { width: 345 });
      fieldY += Math.max(20, valueHeight + 10);
    });

    doc.y = fieldY;
    doc.moveDown(2);

    // Attribution Section
    if (submission.attribution_json && Object.keys(submission.attribution_json).length > 0) {
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e0e0e0');
      doc.moveDown(1);
      doc.fontSize(12).font('Helvetica-Bold').text('Attribution Data');
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica').fillColor('#666666');

      const attribution = submission.attribution_json;
      if (attribution.utms) {
        Object.entries(attribution.utms).forEach(([key, value]) => {
          if (value) doc.text(`${key}: ${value}`);
        });
      }
      if (attribution.referrer) doc.text(`Referrer: ${attribution.referrer}`);
      if (attribution.landing_page) doc.text(`Landing Page: ${attribution.landing_page}`);
    }

    // Footer
    doc.fontSize(8).fillColor('#999999');
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.text(
        `Generated by Anchor Forms • Page ${i + 1} of ${pageCount} • ${new Date().toISOString()}`,
        50, 780, { align: 'center', width: 495 }
      );
    }

    // Finalize PDF
    doc.end();

    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Calculate checksum
    const fileBuffer = await fs.readFile(filepath);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const fileSize = fileBuffer.length;

    // Store artifact reference
    const { rows: artifactRows } = await client.query(`
      INSERT INTO form_pdf_artifacts (submission_id, storage_path, file_name, file_size_bytes, checksum, generated_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [submissionId, filepath, filename, fileSize, checksum, generatedBy]);

    // Audit log
    await client.query(`
      INSERT INTO form_audit_logs (actor_id, action, entity_type, entity_id, metadata_json)
      VALUES ($1, 'pdf.generated', 'submission', $2, $3)
    `, [generatedBy, submissionId, { filename, fileSize, checksum }]);

    return {
      success: true,
      artifact: artifactRows[0],
      filepath,
      filename,
      checksum
    };
  } finally {
    client.release();
  }
}

/**
 * Get PDF artifact for download
 */
export async function getPDFArtifact(artifactId) {
  const { rows } = await query(`
    SELECT * FROM form_pdf_artifacts WHERE id = $1
  `, [artifactId]);

  if (!rows.length) {
    return null;
  }

  const artifact = rows[0];
  
  // Verify file exists
  try {
    await fs.access(artifact.storage_path);
    return artifact;
  } catch {
    return null;
  }
}

/**
 * Delete old PDF artifacts (for cleanup)
 */
export async function deleteOldPDFArtifacts(retentionDays = 90) {
  const client = await getClient();
  
  try {
    const { rows } = await client.query(`
      DELETE FROM form_pdf_artifacts 
      WHERE generated_at < NOW() - INTERVAL '${retentionDays} days'
      RETURNING storage_path
    `);

    // Delete files
    for (const row of rows) {
      try {
        await fs.unlink(row.storage_path);
      } catch {}
    }

    return { deleted: rows.length };
  } finally {
    client.release();
  }
}

// Helper functions
function formatFieldLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function formatFieldValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

