export type Sensitivity = 'none' | 'low' | 'medium' | 'high';

export type SensitiveValue = {
  masked: string;
  raw?: string;
  sensitivity: Sensitivity;
  reason?: string;
};

export type SensitiveText = SensitiveValue;

export type HeaderMap = Record<string, SensitiveValue>;
