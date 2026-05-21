export function Topbar() {
  return (
    <header className="topbar" role="banner">
      <div className="topbar__brand">
        <span className="topbar__brand-mark" aria-hidden="true">
          ◎
        </span>
        <span>AuthLens</span>
      </div>
      <span className="topbar__notice">
        Authorized use only · sensitive values are masked by default
      </span>
    </header>
  );
}
