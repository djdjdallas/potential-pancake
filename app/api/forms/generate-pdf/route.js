/**
 * PDF generation endpoint for claim forms
 * @module app/api/forms/generate-pdf
 */

import { NextResponse } from 'next/server';
import { generatePDF, uploadPDF, saveFormData } from '@/lib/formService';
import { createServiceClient, getUserFromRequest } from '@/lib/supabase';
import { logError, logInfo } from '@/lib/logger';
import { validateRequiredFields, validateBodySize } from '@/lib/validation';

/**
 * Generate PDF from form data
 */
export async function POST(request) {
  const startTime = Date.now();

  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate request size (PDFs can be large)
    const sizeValidation = validateBodySize(body, 5000); // 5MB max
    if (!sizeValidation.valid) {
      return NextResponse.json(
        { error: sizeValidation.error },
        { status: 413 }
      );
    }

    // Validate required fields
    const validation = validateRequiredFields(body, ['formData']);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { formData, moneyFoundId, claimInfo } = body;
    logInfo('Starting PDF generation', { userId: user.id, moneyFoundId });

    // Get claim information if moneyFoundId provided
    let claimDetails = claimInfo;
    if (moneyFoundId && !claimDetails) {
      const supabase = createServiceClient();
      const { data: moneyFound } = await supabase
        .from('money_found')
        .select('*')
        .eq('id', moneyFoundId)
        .eq('user_id', user.id)
        .single();

      if (moneyFound) {
        claimDetails = {
          id: moneyFound.id,
          company: moneyFound.company_name,
          title: moneyFound.description,
          amount: moneyFound.amount
        };
      }
    }

    // Generate PDF
    const pdfBuffer = await generatePDF(formData, claimDetails);

    // Upload PDF to storage
    let pdfUrl = null;
    if (moneyFoundId) {
      try {
        pdfUrl = await uploadPDF(pdfBuffer, user.id, moneyFoundId);

        // Save form data and PDF URL to database
        await saveFormData(user.id, moneyFoundId, formData, pdfUrl);
      } catch (uploadError) {
        logError('PDF upload error', uploadError, { userId: user.id, moneyFoundId });
        // Continue without saving URL
      }
    }

    // Convert buffer to base64 for response
    const pdfBase64 = pdfBuffer.toString('base64');

    const duration = Date.now() - startTime;
    logInfo('PDF generated successfully', {
      userId: user.id,
      moneyFoundId,
      duration,
      pdfSize: pdfBuffer.length
    });

    return NextResponse.json({
      success: true,
      pdfBase64,
      pdfUrl,
      message: 'PDF generated successfully'
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logError('PDF generation error', error, { duration });

    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Download PDF
 */
export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const formId = searchParams.get('formId');

    if (!formId) {
      return NextResponse.json(
        { error: 'Form ID is required' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Get form data
    const { data: form, error } = await supabase
      .from('claim_forms')
      .select('*')
      .eq('id', formId)
      .eq('user_id', user.id)
      .single();

    if (error || !form) {
      return NextResponse.json(
        { error: 'Form not found' },
        { status: 404 }
      );
    }

    if (!form.pdf_url) {
      return NextResponse.json(
        { error: 'PDF not generated for this form' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      pdfUrl: form.pdf_url,
      formData: form.form_data
    });

  } catch (error) {
    console.error('PDF download error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve PDF' },
      { status: 500 }
    );
  }
}