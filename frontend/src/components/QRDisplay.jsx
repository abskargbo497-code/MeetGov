import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './QRDisplay.css';

const QRDisplay = ({ qrCodeUrl, qrToken, meetingId }) => {
  const qrData = qrCodeUrl
    ? null
    : JSON.stringify({
        meetingId,
        token: qrToken,
        timestamp: Date.now(),
      });

  return (
    <div className="qr-display">
      <h2 className="qr-display-title">Meeting QR Code</h2>
      <div className="qr-display-container">
        {qrCodeUrl ? (
          <img src={qrCodeUrl} alt="QR Code" className="qr-display-image" />
        ) : (
          <QRCodeSVG value={qrData} size={256} className="qr-display-svg" />
        )}
      </div>
      {qrToken && (
        <div className="qr-display-token">
          <p className="qr-display-token-label">Token:</p>
          <code className="qr-display-token-value">{qrToken}</code>
        </div>
      )}
      <p className="qr-display-instruction">
        Scan this QR code to check in to the meeting
      </p>
    </div>
  );
};

export default QRDisplay;


