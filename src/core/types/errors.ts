export type AuthLensErrorCode =
  | 'BrowserLaunchFailed'
  | 'CaptureTimeout'
  | 'StorageAccessDenied'
  | 'ReportExportFailed'
  | 'DatabaseWriteFailed'
  | 'InvalidUrl'
  | 'UnknownError';

const USER_MESSAGES: Record<AuthLensErrorCode, string> = {
  BrowserLaunchFailed: 'Browser could not be started.',
  CaptureTimeout: 'Capture session timed out.',
  StorageAccessDenied: 'Browser storage could not be inspected.',
  ReportExportFailed: 'Report export failed.',
  DatabaseWriteFailed: 'Analysis result could not be saved.',
  InvalidUrl: 'The provided URL is not valid.',
  UnknownError: 'An unexpected error occurred.',
};

export class AuthLensError extends Error {
  public readonly code: AuthLensErrorCode;
  public readonly userMessage: string;

  constructor(code: AuthLensErrorCode, internalMessage?: string) {
    super(internalMessage ?? USER_MESSAGES[code]);
    this.name = 'AuthLensError';
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

export function toUserMessage(code: AuthLensErrorCode): string {
  return USER_MESSAGES[code];
}
