const PDFDocument = require('pdfkit');
const fs = require('fs');

function generateLetterPdf({
  requestCode,
  letterType,
  employeeName,
  empId,
  designation,
  joiningDate,
  salary,
  entity,
  region,
  content,
  issuedBy,
  issueDate = new Date(),
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 55, right: 55 },
      info: {
        Title: `${letterType} - ${employeeName}`,
        Author: 'EICS Corporate Services LLC',
        Subject: letterType,
        Keywords: 'HRMS, Corporate Letter, Verification',
      },
    });

    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const primaryColor = '#1e3a8a';
    const textColor = '#1f2937';
    const mutedColor = '#6b7280';
    const borderColor = '#e5e7eb';

    // 1. Corporate Header
    doc.fontSize(16).font('Helvetica-Bold').fillColor(primaryColor).text(entity || 'EICS CORPORATE SERVICES LLC', 55, 50);
    doc.fontSize(9).font('Helvetica').fillColor(mutedColor).text('Corporate Human Resources & Mobility Division', 55, 70);
    
    const formattedDate = new Date(issueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.fontSize(9).font('Helvetica-Bold').fillColor(textColor).text(`Date: ${formattedDate}`, 380, 50, { align: 'right' });
    doc.fontSize(9).font('Helvetica').fillColor(mutedColor).text(`Ref: ${requestCode || 'LTR-101'}`, 380, 65, { align: 'right' });

    // Divider
    doc.moveTo(55, 88).lineTo(540, 88).lineWidth(1.5).strokeColor(primaryColor).stroke();

    // 2. Letter Title
    doc.moveDown(2);
    doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text(letterType.toUpperCase(), { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(textColor).text('TO WHOM IT MAY CONCERN', { align: 'center' });

    // 3. Employee Summary Metadata Box
    doc.moveDown(1.2);
    const boxTop = doc.y;
    doc.roundedRect(55, boxTop, 485, 62, 4).fillAndStroke('#f8fafc', borderColor);
    
    doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor);
    doc.text('Employee Name:', 70, boxTop + 10);
    doc.text('Employee ID:', 70, boxTop + 26);
    doc.text('Designation:', 70, boxTop + 42);

    doc.font('Helvetica').fillColor(textColor);
    doc.text(employeeName, 170, boxTop + 10);
    doc.text(String(empId), 170, boxTop + 26);
    doc.text(designation || 'Staff', 170, boxTop + 42);

    doc.font('Helvetica-Bold').fillColor(primaryColor);
    doc.text('Entity / Region:', 310, boxTop + 10);
    doc.text('Joining Date:', 310, boxTop + 26);
    doc.text('Employment Status:', 310, boxTop + 42);

    doc.font('Helvetica').fillColor(textColor);
    doc.text(region || 'GCC Operations', 415, boxTop + 10);
    doc.text(joiningDate || 'N/A', 415, boxTop + 26);
    doc.text('Active / Confirmed', 415, boxTop + 42);

    // 4. Letter Body Content
    doc.y = boxTop + 78;
    doc.moveDown(0.8);
    doc.fontSize(10.5).font('Helvetica').fillColor(textColor);
    
    // Clean and write body paragraphs
    const paragraphs = (content || '').split('\n').filter(p => p.trim().length > 0);
    for (const p of paragraphs) {
      doc.text(p.trim(), {
        align: 'justify',
        lineGap: 4,
      });
      doc.moveDown(0.8);
    }

    // 5. Signatory Block
    doc.moveDown(1.5);
    const sigY = Math.max(doc.y, 620);
    doc.y = sigY;

    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(textColor).text('Authorized Signatory,');
    doc.fontSize(9.5).font('Helvetica').fillColor(textColor).text(issuedBy || 'Human Resources Department');
    doc.fontSize(9).font('Helvetica-Oblique').fillColor(mutedColor).text(entity || 'EICS Corporate Services LLC');

    // Official Stamp Simulation
    doc.roundedRect(380, sigY - 10, 150, 55, 3).strokeColor('#3b82f6').lineWidth(1).stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#2563eb').text('EICS HRMS VERIFIED', 385, sigY - 3, { width: 140, align: 'center' });
    doc.fontSize(7).font('Helvetica').fillColor('#2563eb').text(`Digitally Certified: ${requestCode}`, 385, sigY + 12, { width: 140, align: 'center' });
    doc.fontSize(6.5).font('Helvetica').fillColor('#64748b').text('Valid without physical stamp', 385, sigY + 26, { width: 140, align: 'center' });

    // 6. Footer
    doc.moveTo(55, 780).lineTo(540, 780).lineWidth(0.5).strokeColor(borderColor).stroke();
    doc.fontSize(7.5).font('Helvetica').fillColor(mutedColor).text(
      'This certificate is an official corporate document generated through the EICS HRMS enterprise portal. For verification, contact hr@eicscomp.com.',
      55,
      787,
      { align: 'center', width: 485 }
    );

    doc.end();
  });
}

async function test() {
  const buf = await generateLetterPdf({
    requestCode: 'LTR-101',
    letterType: 'Experience Letter',
    employeeName: 'Saleem Khan',
    empId: 2,
    designation: 'Operations Executive',
    joiningDate: '2023-01-15',
    salary: 'AED 8,500',
    entity: 'EICS UAE LLC',
    region: 'United Arab Emirates',
    content: 'This is to certify that Saleem Khan has been employed with EICS UAE LLC since 2023-01-15 as Operations Executive. During his tenure, his conduct and performance have been commendable. This certificate is issued upon his request for banking and administrative verification purposes.',
    issuedBy: 'HR & Mobility Operations',
  });

  fs.writeFileSync('test-letter.pdf', buf);
  console.log('Generated test-letter.pdf! Size:', buf.length, 'Header:', buf.slice(0, 5).toString());
}

test().catch(console.error);
