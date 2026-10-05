import PDFDocument from 'pdfkit';

export interface GenerateLetterPdfOptions {
  requestCode: string;
  letterType: string;
  employeeName: string;
  empId: number;
  designation?: string;
  joiningDate?: string;
  salary?: string;
  entity?: string;
  region?: string;
  content: string;
  issuedBy?: string;
  issueDate?: Date;
}

export function generateLetterPdf(options: GenerateLetterPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 55, right: 55 },
      info: {
        Title: `${options.letterType} - ${options.employeeName}`,
        Author: 'EICS Corporate Services LLC',
        Subject: options.letterType,
        Keywords: 'HRMS, Corporate Letter, Experience Letter, Employment Verification',
      },
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const primaryColor = '#1e3a8a';
    const textColor = '#1f2937';
    const mutedColor = '#6b7280';
    const borderColor = '#e2e8f0';

    // 1. Corporate Header
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(options.entity || 'EICS CORPORATE SERVICES LLC', 55, 50);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(mutedColor)
      .text('Corporate Human Resources & Mobility Division', 55, 70);

    const formattedDate = new Date(options.issueDate || new Date()).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor(textColor)
      .text(`Date: ${formattedDate}`, 370, 50, { align: 'right', width: 170 });

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(mutedColor)
      .text(`Ref: ${options.requestCode || 'LTR-101'}`, 370, 65, { align: 'right', width: 170 });

    // Header divider line
    doc.moveTo(55, 88).lineTo(540, 88).lineWidth(1.5).strokeColor(primaryColor).stroke();

    // 2. Letter Title
    doc.moveDown(2.2);
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(options.letterType.toUpperCase(), { align: 'center' });

    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(textColor)
      .text('TO WHOM IT MAY CONCERN', { align: 'center' });

    // 3. Employee Summary Metadata Box
    doc.moveDown(1.2);
    const boxTop = doc.y;
    doc.roundedRect(55, boxTop, 485, 62, 4).fillAndStroke('#f8fafc', borderColor);

    doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor);
    doc.text('Employee Name:', 70, boxTop + 10);
    doc.text('Employee ID:', 70, boxTop + 26);
    doc.text('Designation:', 70, boxTop + 42);

    doc.font('Helvetica').fillColor(textColor);
    doc.text(options.employeeName, 170, boxTop + 10);
    doc.text(String(options.empId), 170, boxTop + 26);
    doc.text(options.designation || 'Staff', 170, boxTop + 42);

    doc.font('Helvetica-Bold').fillColor(primaryColor);
    doc.text('Entity / Region:', 310, boxTop + 10);
    doc.text('Joining Date:', 310, boxTop + 26);
    doc.text('Employment Status:', 310, boxTop + 42);

    doc.font('Helvetica').fillColor(textColor);
    doc.text(options.region || 'GCC Operations', 415, boxTop + 10);
    doc.text(options.joiningDate || 'N/A', 415, boxTop + 26);
    doc.text('Active / Confirmed', 415, boxTop + 42);

    // 4. Letter Body Content
    doc.y = boxTop + 78;
    doc.moveDown(0.8);
    doc.fontSize(10.5).font('Helvetica').fillColor(textColor);

    const paragraphs = (options.content || '')
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    for (const p of paragraphs) {
      doc.text(p, {
        align: 'justify',
        lineGap: 4,
      });
      doc.moveDown(0.8);
    }

    // 5. Signatory Block
    doc.moveDown(1.5);
    const sigY = Math.max(doc.y, 610);
    doc.y = sigY;

    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(textColor).text('Authorized Signatory,');
    doc.fontSize(9.5).font('Helvetica').fillColor(textColor).text(options.issuedBy || 'Human Resources Department');
    doc.fontSize(9).font('Helvetica-Oblique').fillColor(mutedColor).text(options.entity || 'EICS Corporate Services LLC');

    // Corporate Security Certification Seal
    doc.roundedRect(375, sigY - 10, 165, 58, 4).strokeColor('#2563eb').lineWidth(1).stroke();
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1e40af').text('EICS HRMS VERIFIED', 380, sigY - 2, { width: 155, align: 'center' });
    doc.fontSize(7.5).font('Helvetica').fillColor('#2563eb').text(`Reference: ${options.requestCode}`, 380, sigY + 12, { width: 155, align: 'center' });
    doc.fontSize(6.5).font('Helvetica').fillColor('#64748b').text('Digitally Issued & Certified Document', 380, sigY + 26, { width: 155, align: 'center' });
    doc.fontSize(6).font('Helvetica-Oblique').fillColor('#94a3b8').text('Valid without physical rubber stamp', 380, sigY + 38, { width: 155, align: 'center' });

    // 6. Security Footer
    doc.moveTo(55, 780).lineTo(540, 780).lineWidth(0.5).strokeColor(borderColor).stroke();
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor(mutedColor)
      .text(
        'This certificate is an official corporate document generated through the EICS HRMS enterprise portal. For verification, contact hr@eicscomp.com.',
        55,
        787,
        { align: 'center', width: 485 },
      );

    doc.end();
  });
}
