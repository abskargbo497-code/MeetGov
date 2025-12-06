import PDFDocument from 'pdfkit';
import { log } from '../utils/logger.js';

/**
 * Generate PDF report for a meeting
 * @param {Object} meeting - Meeting object with all related data
 * @param {Object} summaryReport - Optional summary report data for bulk reports
 * @returns {Promise<Buffer>} PDF buffer
 */
export const generatePDFReport = async (meeting, summaryReport = null) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      // Collect PDF data
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      if (summaryReport) {
        // Generate summary report
        generateSummaryReportPDF(doc, summaryReport);
      } else if (meeting) {
        // Generate single meeting report
        generateMeetingReportPDF(doc, meeting);
      } else {
        reject(new Error('Either meeting or summaryReport must be provided'));
      }

      doc.end();
    } catch (error) {
      log.error('Error generating PDF report', error);
      reject(error);
    }
  });
};

/**
 * Generate PDF for a single meeting
 */
const generateMeetingReportPDF = (doc, meeting) => {
  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('MEETING REPORT', { align: 'center' });
  doc.moveDown();

  // Meeting Information
  doc.fontSize(16).font('Helvetica-Bold').text('Meeting Information', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica');

  doc.text(`Title: ${meeting.title || 'N/A'}`);
  doc.text(`Date: ${meeting.datetime ? new Date(meeting.datetime).toLocaleString() : 'N/A'}`);
  doc.text(`Location: ${meeting.location || 'N/A'}`);
  doc.text(`Status: ${meeting.status || 'N/A'}`);
  if (meeting.organizer) {
    doc.text(`Organizer: ${meeting.organizer.name} (${meeting.organizer.email})`);
  }
  doc.moveDown();

  // Attendance
  if (meeting.attendances && meeting.attendances.length > 0) {
    doc.fontSize(16).font('Helvetica-Bold').text('Attendance', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');

    meeting.attendances.forEach((att, index) => {
      const userName = att.user ? att.user.name : 'Unknown';
      const checkIn = att.checked_in_at ? new Date(att.checked_in_at).toLocaleString() : 'N/A';
      const checkOut = att.checked_out_at ? new Date(att.checked_out_at).toLocaleString() : 'N/A';
      doc.text(`${index + 1}. ${userName} - Check-in: ${checkIn}, Check-out: ${checkOut}`);
    });
    doc.moveDown();
  }

  // Transcript Summary
  if (meeting.transcript) {
    const transcript = meeting.transcript;
    doc.fontSize(16).font('Helvetica-Bold').text('Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');

    if (transcript.summary_text) {
      doc.text(transcript.summary_text);
      doc.moveDown();
    }

    // Key Points
    if (transcript.summary_json?.key_points && transcript.summary_json.key_points.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Key Points:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica');
      transcript.summary_json.key_points.forEach((point, index) => {
        doc.text(`${index + 1}. ${point}`);
      });
      doc.moveDown();
    }

    // Decisions
    if (transcript.summary_json?.decisions && transcript.summary_json.decisions.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Decisions Made:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica');
      transcript.summary_json.decisions.forEach((decision, index) => {
        doc.text(`${index + 1}. ${decision}`);
      });
      doc.moveDown();
    }
  }

  // Action Items / Tasks
  if (meeting.tasks && meeting.tasks.length > 0) {
    doc.fontSize(16).font('Helvetica-Bold').text('Action Items', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');

    meeting.tasks.forEach((task, index) => {
      doc.text(`${index + 1}. ${task.title}`);
      if (task.description) {
        doc.fontSize(10).text(`   Description: ${task.description}`, { indent: 20 });
      }
      doc.fontSize(12);
      doc.text(`   Status: ${task.status} | Priority: ${task.priority} | Deadline: ${task.deadline ? new Date(task.deadline).toLocaleDateString() : 'N/A'}`);
      if (task.assignedTo) {
        doc.text(`   Assigned to: ${task.assignedTo.name} (${task.assignedTo.email})`);
      }
      doc.moveDown(0.5);
    });
  }

  // Footer
  doc.fontSize(10).font('Helvetica').text(
    `Report generated on ${new Date().toLocaleString()}`,
    { align: 'center' }
  );
};

/**
 * Generate PDF for summary report
 */
const generateSummaryReportPDF = (doc, summaryReport) => {
  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('MEETINGS SUMMARY REPORT', { align: 'center' });
  doc.moveDown();

  // Period
  if (summaryReport.period) {
    doc.fontSize(12).font('Helvetica');
    if (summaryReport.period.start_date) {
      doc.text(`Start Date: ${new Date(summaryReport.period.start_date).toLocaleDateString()}`);
    }
    if (summaryReport.period.end_date) {
      doc.text(`End Date: ${new Date(summaryReport.period.end_date).toLocaleDateString()}`);
    }
    doc.moveDown();
  }

  // Statistics
  if (summaryReport.statistics) {
    doc.fontSize(16).font('Helvetica-Bold').text('Statistics', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');

    const stats = summaryReport.statistics;
    doc.text(`Total Meetings: ${stats.total_meetings || 0}`);
    doc.text(`Total Attendances: ${stats.total_attendances || 0}`);
    doc.text(`Total Tasks: ${stats.total_tasks || 0}`);
    doc.text(`Completed Tasks: ${stats.completed_tasks || 0}`);
    doc.moveDown();

    // Status breakdown
    if (stats.by_status && Object.keys(stats.by_status).length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Meetings by Status:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica');
      Object.entries(stats.by_status).forEach(([status, count]) => {
        doc.text(`${status}: ${count}`);
      });
      doc.moveDown();
    }
  }

  // Meetings List
  if (summaryReport.meetings && summaryReport.meetings.length > 0) {
    doc.fontSize(16).font('Helvetica-Bold').text('Meetings', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');

    summaryReport.meetings.forEach((meeting, index) => {
      doc.text(`${index + 1}. ${meeting.title}`);
      doc.fontSize(10).text(
        `   Date: ${new Date(meeting.datetime).toLocaleString()} | Status: ${meeting.status} | Organizer: ${meeting.organizer || 'N/A'} | Attendance: ${meeting.attendance_count} | Tasks: ${meeting.task_count}`,
        { indent: 20 }
      );
      doc.fontSize(12);
      doc.moveDown(0.5);
    });
  }

  // Footer
  doc.fontSize(10).font('Helvetica').text(
    `Report generated on ${new Date().toLocaleString()}`,
    { align: 'center' }
  );
};


