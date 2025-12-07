import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAPI } from '../hooks/useAPI';
import QRDisplay from '../components/QRDisplay';
import './MeetingQR.css';

const MeetingQR = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { get } = useAPI();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMeetingQR();
  }, [id]);

  const fetchMeetingQR = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await get(`/meetings/${id}/qr`);
      if (result.success) {
        // Also fetch meeting details to get title
        const meetingResult = await get(`/meetings/${id}`);
        if (meetingResult.success) {
          setMeeting({
            ...meetingResult.data.data.meeting,
            qrCodeUrl: result.data.data.qrCodeUrl,
            qrToken: result.data.data.qrToken,
          });
        } else {
          setMeeting({
            qrCodeUrl: result.data.data.qrCodeUrl,
            qrToken: result.data.data.qrToken,
          });
        }
      } else {
        setError(result.error || 'Failed to fetch QR code');
      }
    } catch (err) {
      setError('Failed to fetch QR code');
      console.error('Error fetching QR code:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="meeting-qr-loading">Loading QR code...</div>;
  }

  if (error) {
    return (
      <div className="meeting-qr-error">
        <p>{error}</p>
        <button onClick={() => navigate(`/meetings/${id}`)}>Back to Meeting</button>
      </div>
    );
  }

  if (!meeting || !meeting.qrCodeUrl) {
    return (
      <div className="meeting-qr-error">
        <p>QR code not available for this meeting</p>
        <button onClick={() => navigate(`/meetings/${id}`)}>Back to Meeting</button>
      </div>
    );
  }

  return (
    <div className="meeting-qr">
      <div className="meeting-qr-header">
        <button onClick={() => navigate(`/meetings/${id}`)} className="meeting-qr-back">
          ← Back to Meeting
        </button>
      </div>
      <div className="meeting-qr-content">
        {meeting.title && (
          <h1 className="meeting-qr-title">{meeting.title}</h1>
        )}
        <QRDisplay
          qrCodeUrl={meeting.qrCodeUrl}
          qrToken={meeting.qrToken}
          meetingId={id}
        />
      </div>
    </div>
  );
};

export default MeetingQR;

