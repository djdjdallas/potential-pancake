/**
 * Form handling service for auto-fill and PDF generation
 * @module lib/formService
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { autoFillClaimForm } from './claude.js';
import { createServiceClient } from './supabase.js';

/**
 * Auto-fill a claim form using AI
 * @param {Object} formFields - Form field definitions
 * @param {Object} userData - User's information
 * @returns {Promise<Object>} Filled form data
 */
export async function autoFillForm(formFields, userData) {
  try {
    // Use AI to intelligently fill the form
    const filledData = await autoFillClaimForm(formFields, userData);

    // Validate required fields
    const requiredFields = Object.entries(formFields)
      .filter(([_, field]) => field.required)
      .map(([name, _]) => name);

    const missingFields = requiredFields.filter(field => !filledData[field]);

    if (missingFields.length > 0) {
      return {
        success: false,
        data: filledData,
        missingFields,
        message: 'Some required fields could not be auto-filled'
      };
    }

    return {
      success: true,
      data: filledData,
      message: 'Form auto-filled successfully'
    };
  } catch (error) {
    console.error('Error auto-filling form:', error);
    throw new Error('Failed to auto-fill form');
  }
}

/**
 * Generate a PDF from form data
 * @param {Object} formData - Completed form data
 * @param {Object} claimInfo - Information about the claim
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generatePDF(formData, claimInfo) {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Add a page
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    // Embed font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let yPosition = height - 50;

    // Title
    page.drawText('CLAIM FORM', {
      x: 50,
      y: yPosition,
      size: 20,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    yPosition -= 40;

    // Claim Information
    page.drawText('Claim Information', {
      x: 50,
      y: yPosition,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    yPosition -= 25;

    if (claimInfo) {
      const claimDetails = [
        `Company: ${claimInfo.company || 'N/A'}`,
        `Settlement: ${claimInfo.title || 'N/A'}`,
        `Claim ID: ${claimInfo.id || 'N/A'}`,
        `Amount: ${claimInfo.amount || 'Unknown'}`,
      ];

      for (const detail of claimDetails) {
        page.drawText(detail, {
          x: 50,
          y: yPosition,
          size: 11,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        yPosition -= 20;
      }
    }

    yPosition -= 20;

    // Personal Information
    page.drawText('Personal Information', {
      x: 50,
      y: yPosition,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    yPosition -= 25;

    // Add form data to PDF
    for (const [key, value] of Object.entries(formData)) {
      if (value && yPosition > 50) {
        // Format field name
        const fieldName = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());

        // Draw field name
        page.drawText(`${fieldName}:`, {
          x: 50,
          y: yPosition,
          size: 11,
          font: boldFont,
          color: rgb(0.1, 0.1, 0.1),
        });

        // Draw field value
        const valueStr = String(value);
        const maxWidth = width - 250;

        // Split long text into multiple lines if needed
        const lines = [];
        let currentLine = '';
        const words = valueStr.split(' ');

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const textWidth = font.widthOfTextAtSize(testLine, 11);

          if (textWidth > maxWidth) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          lines.push(currentLine);
        }

        // Draw value lines
        lines.forEach((line, index) => {
          page.drawText(line, {
            x: 200,
            y: yPosition - (index * 15),
            size: 11,
            font,
            color: rgb(0.3, 0.3, 0.3),
          });
        });

        yPosition -= 25 + (lines.length - 1) * 15;

        // Add new page if needed
        if (yPosition < 50 && Object.keys(formData).indexOf(key) < Object.keys(formData).length - 1) {
          const newPage = pdfDoc.addPage([595, 842]);
          yPosition = height - 50;
          page.drawText('(Continued)', {
            x: 50,
            y: yPosition,
            size: 11,
            font,
            color: rgb(0.5, 0.5, 0.5),
          });
          yPosition -= 30;
        }
      }
    }

    // Add footer with generation date
    const footerY = 30;
    const dateStr = new Date().toLocaleDateString();
    page.drawText(`Generated on ${dateStr} by Found Money App`, {
      x: 50,
      y: footerY,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Serialize the PDF to bytes
    const pdfBytes = await pdfDoc.save();

    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}

/**
 * Upload PDF to Supabase Storage
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {string} userId - User ID
 * @param {string} claimId - Claim ID
 * @returns {Promise<string>} Public URL of uploaded PDF
 */
export async function uploadPDF(pdfBuffer, userId, claimId) {
  try {
    const supabase = createServiceClient();

    // Create bucket if it doesn't exist
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === 'claim-forms');

    if (!bucketExists) {
      await supabase.storage.createBucket('claim-forms', {
        public: false,
        fileSizeLimit: 10485760, // 10MB
      });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${userId}/${claimId}_${timestamp}.pdf`;

    // Upload PDF
    const { data, error } = await supabase.storage
      .from('claim-forms')
      .upload(filename, pdfBuffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('claim-forms')
      .getPublicUrl(filename);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading PDF:', error);
    throw new Error('Failed to upload PDF');
  }
}

/**
 * Save form data to database
 * @param {string} userId - User ID
 * @param {string} moneyFoundId - Money found record ID
 * @param {Object} formData - Form data to save
 * @param {string} pdfUrl - URL of generated PDF
 * @returns {Promise<Object>} Saved form record
 */
export async function saveFormData(userId, moneyFoundId, formData, pdfUrl = null) {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('claim_forms')
      .upsert({
        user_id: userId,
        money_found_id: moneyFoundId,
        form_data: formData,
        pdf_url: pdfUrl,
        status: pdfUrl ? 'completed' : 'draft',
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error saving form data:', error);
    throw new Error('Failed to save form data');
  }
}