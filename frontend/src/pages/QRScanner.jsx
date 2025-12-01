import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { useAPI } from '../hooks/useAPI';
import './QRScanner.css';

const QRScanner = () => {
  const navigate = useNavigate();
  const { post } = useAPI();
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        qrbox: {
          width: 250,
          height: 250,
        },
        fps: 5,
      },
      false
    );

    scanner.render(
      (decodedText) => {
        handleQRCodeScanned(decodedText);
        scanner.clear();
      },
      (errorMessage) => {
        // Ignore scanning errors
      }
    );

    return () => {
      scanner.clear();
    };
  }, []);

  const handleQRCodeScanned = async (qrData) => {
    try {
      const data = JSON.parse(qrData);
      const { meetingId, token } = data;

      setLoading(true);
      setError('');

      const result = await post(`/meetings/${meetingId}/attendance`, {
        qrToken: token,
      });

      if (result.success) {
        setScanResult('Attendance logged successfully!');
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      } else {
        setError(result.error || 'Failed to log attendance');
      }
    } catch (err) {
      setError('Invalid QR code format');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="qr-scanner">
      <div className="qr-scanner-container">
        <h1 className="qr-scanner-title">QR Code Scanner</h1>
        <p className="qr-scanner-instruction">
          Point your camera at the meeting QR code to check in
        </p>

        {error && <div className="qr-scanner-error">{error}</div>}
        {scanResult && (
          <div className="qr-scanner-success">{scanResult}</div>
        )}

        <div id="qr-reader" className="qr-scanner-reader"></div>

        {loading && (
          <div className="qr-scanner-loading">Processing...</div>
        )}
      </div>
    </div>
  );
};

export default QRScanner;


