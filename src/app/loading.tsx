export default function GlobalLoading() {
  return (
    <div className="global-loading-page">
      <div className="global-loading-card animate-in">
        <div className="global-loading-icon-wrapper">
          <div className="global-loading-spinner-ring" />
          <span className="global-loading-icon">⏱</span>
        </div>
        <div className="global-loading-content">
          <h3 className="global-loading-title">Loading...</h3>
          <p className="global-loading-subtitle">Please wait a moment</p>
        </div>
      </div>
    </div>
  );
}
