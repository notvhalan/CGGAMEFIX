import "~/styles/pages/settings.css";

export default function Settings() {
  return (
    <div className="settings-page">
      <h1 className="settings-title">⚙️ Settings</h1>

      <div className="settings-section">
        <h2 className="settings-section-title">Account</h2>
        <div className="settings-info">
          <div className="settings-info-item">
            <span className="settings-info-label">Email:</span>
            <span>user@example.com</span>
          </div>
          <div className="settings-info-item">
            <span className="settings-info-label">Member Since:</span>
            <span>January 2026</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">Preferences</h2>
        <div className="settings-preferences">
          <label className="settings-checkbox-label">
            <input type="checkbox" className="settings-checkbox" />
            <span>Email notifications for matched orders</span>
          </label>
          <label className="settings-checkbox-label">
            <input type="checkbox" className="settings-checkbox" />
            <span>Email notifications for market updates</span>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">Security</h2>
        <button className="settings-button">
          🔒 Change Password
        </button>
      </div>
    </div>
  );
}
