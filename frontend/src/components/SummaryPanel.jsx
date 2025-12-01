import React from 'react';
import './SummaryPanel.css';

const SummaryPanel = ({ summary, actionItems, minutes }) => {
  return (
    <div className="summary-panel">
      {summary && (
        <div className="summary-panel-section">
          <h3 className="summary-panel-title">Summary</h3>
          <div className="summary-panel-content">{summary}</div>
        </div>
      )}

      {actionItems && actionItems.length > 0 && (
        <div className="summary-panel-section">
          <h3 className="summary-panel-title">Action Items</h3>
          <ul className="summary-panel-action-items">
            {actionItems.map((item, index) => (
              <li key={index} className="summary-panel-action-item">
                <strong>{item.title}</strong>
                {item.description && <p>{item.description}</p>}
                <div className="summary-panel-action-meta">
                  {item.assigned_to && (
                    <span>Assigned to: {item.assigned_to}</span>
                  )}
                  {item.suggested_deadline && (
                    <span>Deadline: {new Date(item.suggested_deadline).toLocaleDateString()}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {minutes && (
        <div className="summary-panel-section">
          <h3 className="summary-panel-title">Full Minutes</h3>
          <pre className="summary-panel-minutes">{minutes}</pre>
        </div>
      )}
    </div>
  );
};

export default SummaryPanel;


