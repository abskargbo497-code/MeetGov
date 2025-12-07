import React from 'react';
import './SummaryPanel.css';

const SummaryPanel = ({ summary, actionItems, minutes, rawText }) => {
  // Safely parse actionItems if it's a string (JSON)
  let parsedActionItems = actionItems;
  if (typeof actionItems === 'string') {
    try {
      parsedActionItems = JSON.parse(actionItems);
    } catch (e) {
      console.error('Error parsing actionItems JSON:', e);
      parsedActionItems = null;
    }
  }

  // Ensure actionItems is an array
  if (parsedActionItems && !Array.isArray(parsedActionItems)) {
    // If it's an object with actionItems property
    if (parsedActionItems.actionItems && Array.isArray(parsedActionItems.actionItems)) {
      parsedActionItems = parsedActionItems.actionItems;
    } else {
      // If it's a single object, wrap it in an array
      parsedActionItems = [parsedActionItems];
    }
  }

  return (
    <div className="summary-panel">
      {summary && (
        <div className="summary-panel-section">
          <h3 className="summary-panel-title">Summary</h3>
          <div className="summary-panel-content">
            {typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2)}
          </div>
        </div>
      )}

      {parsedActionItems && Array.isArray(parsedActionItems) && parsedActionItems.length > 0 && (
        <div className="summary-panel-section">
          <h3 className="summary-panel-title">Action Items ({parsedActionItems.length})</h3>
          <ul className="summary-panel-action-items">
            {parsedActionItems.map((item, index) => {
              // Handle null/undefined items
              if (!item || typeof item !== 'object') {
                return null;
              }

              const title = item.title || item.name || `Action Item ${index + 1}`;
              const description = item.description || item.details || '';
              const assignedTo = item.assigned_to || item.assignedTo || '';
              const deadline = item.suggested_deadline || item.deadline || item.suggestedDeadline || null;

              return (
                <li key={index} className="summary-panel-action-item">
                  <strong>{title}</strong>
                  {description && <p>{description}</p>}
                  <div className="summary-panel-action-meta">
                    {assignedTo && assignedTo !== 'TBD' && (
                      <span>Assigned to: {assignedTo}</span>
                    )}
                    {deadline && (
                      <span>
                        Deadline: {(() => {
                          try {
                            return new Date(deadline).toLocaleDateString();
                          } catch (e) {
                            return deadline;
                          }
                        })()}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {minutes && (
        <div className="summary-panel-section">
          <h3 className="summary-panel-title">Full Minutes</h3>
          <pre className="summary-panel-minutes">
            {typeof minutes === 'string' ? minutes : JSON.stringify(minutes, null, 2)}
          </pre>
        </div>
      )}

      {rawText && (
        <div className="summary-panel-section">
          <h3 className="summary-panel-title">Full Transcript</h3>
          <div className="summary-panel-transcript">{rawText}</div>
        </div>
      )}
    </div>
  );
};

export default SummaryPanel;


