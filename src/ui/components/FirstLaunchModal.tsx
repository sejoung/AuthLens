import { FIRST_LAUNCH_NOTICE } from '@/core';
import { store, useAppState } from '../state/store.js';

export function FirstLaunchModal() {
  const state = useAppState();
  if (state.noticeAcknowledged) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="notice-title">
      <div className="modal">
        <h2 className="modal__title" id="notice-title">
          Authorized use only
        </h2>
        <p className="modal__body">{FIRST_LAUNCH_NOTICE}</p>
        <p className="modal__body">
          AuthLens never stores raw tokens, passwords, or cookies by default. Sensitive values
          are masked across the UI and report exports. Replay and raw-export features are off
          by default and must be enabled per-session.
        </p>
        <div className="modal__actions">
          <button className="btn btn--primary" onClick={store.acknowledgeNotice}>
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
