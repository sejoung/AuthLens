import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TOOL_NAME, TOOL_VERSION, SCHEMA_VERSION } from '@/core';
import type { ReportStrings } from '@/reporter';

/**
 * i18n 키를 `ReportStrings`로 매핑. 리포터 패키지는 i18next 비의존이라
 * UI 쪽에서 이렇게 채워서 넘겨준다.
 */
export function useReportStrings(): ReportStrings {
  const { t, i18n } = useTranslation();
  // i18n.language를 의존성에 포함시켜야 언어 변경 시 메모이즈된 객체가 갱신됨.
  return useMemo<ReportStrings>(() => {
    const tool = TOOL_NAME;
    return {
      title: t('reportContent.title', { tool }),
      disclaimer: t('reportContent.disclaimer', {
        tool,
        version: TOOL_VERSION,
        schema: SCHEMA_VERSION,
      }),
      summaryHeading: t('reportContent.summaryHeading'),
      labelTarget: t('reportContent.labelTarget'),
      labelStarted: t('reportContent.labelStarted'),
      labelEnded: t('reportContent.labelEnded'),
      labelRequestsCaptured: t('reportContent.labelRequestsCaptured'),
      labelLoginCandidates: t('reportContent.labelLoginCandidates'),
      authTypeHeading: t('reportContent.authTypeHeading'),
      labelAuthType: t('reportContent.labelAuthType'),
      noSummary: t('reportContent.noSummary'),
      formatConfidence: (score, level) =>
        t('reportContent.formatConfidence', { score, level }),
      signalsLabel: t('reportContent.signalsLabel'),
      loginCandidateHeading: t('reportContent.loginCandidateHeading'),
      labelScore: t('reportContent.labelScore'),
      labelMethodUrl: t('reportContent.labelMethodUrl'),
      reasonsLabel: t('reportContent.reasonsLabel'),
      noLoginCandidate1: t('reportContent.noLoginCandidate1'),
      noLoginCandidate2: t('reportContent.noLoginCandidate2'),
      cookieHeading: t('reportContent.cookieHeading'),
      noCookieChanges: t('reportContent.noCookieChanges'),
      addedLabel: t('reportContent.addedLabel'),
      changedLabel: t('reportContent.changedLabel'),
      removedLabel: t('reportContent.removedLabel'),
      storageHeading: t('reportContent.storageHeading'),
      noStorageChanges: t('reportContent.noStorageChanges'),
      redirectHeading: t('reportContent.redirectHeading'),
      noRedirects: t('reportContent.noRedirects'),
      diagramHeading: t('reportContent.diagramHeading'),
      timelineHeading: t('reportContent.timelineHeading'),
      noTimeline: t('reportContent.noTimeline'),
      securityHeading: t('reportContent.securityHeading'),
      noSecurityNotes: t('reportContent.noSecurityNotes'),
      footer: t('reportContent.footer', { tool }),
      jwtHeading: t('reportContent.jwtHeading'),
      jwtSourceLabels: {
        'request-header': t('reportContent.jwtSource.request-header'),
        'response-header': t('reportContent.jwtSource.response-header'),
        'response-body': t('reportContent.jwtSource.response-body'),
        cookie: t('reportContent.jwtSource.cookie'),
        'storage-local': t('reportContent.jwtSource.storage-local'),
        'storage-session': t('reportContent.jwtSource.storage-session'),
      },
      jwtAlgorithm: t('reportContent.jwtAlgorithm'),
      jwtSubject: t('reportContent.jwtSubject'),
      jwtIssuer: t('reportContent.jwtIssuer'),
      jwtAudience: t('reportContent.jwtAudience'),
      jwtIssuedAt: t('reportContent.jwtIssuedAt'),
      jwtExpiresAt: t('reportContent.jwtExpiresAt'),
      jwtExpired: t('reportContent.jwtExpired'),
      jwtNotExpired: t('reportContent.jwtNotExpired'),
      jwtHeader: t('reportContent.jwtHeader'),
      jwtPayload: t('reportContent.jwtPayload'),
      jwtSignaturePreview: t('reportContent.jwtSignaturePreview'),
      oauthHeading: t('reportContent.oauthHeading'),
      oauthAuthorizeHeading: t('reportContent.oauthAuthorizeHeading'),
      oauthTokenHeading: t('reportContent.oauthTokenHeading'),
      oauthResponseType: t('reportContent.oauthResponseType'),
      oauthClientId: t('reportContent.oauthClientId'),
      oauthRedirectUri: t('reportContent.oauthRedirectUri'),
      oauthScopeRequested: t('reportContent.oauthScopeRequested'),
      oauthScopeGranted: t('reportContent.oauthScopeGranted'),
      oauthState: t('reportContent.oauthState'),
      oauthNonce: t('reportContent.oauthNonce'),
      oauthPkce: t('reportContent.oauthPkce'),
      oauthPkceYes: t('reportContent.oauthPkceYes'),
      oauthPkceNo: t('reportContent.oauthPkceNo'),
      oauthGrantType: t('reportContent.oauthGrantType'),
      oauthTokenType: t('reportContent.oauthTokenType'),
      oauthExpiresIn: t('reportContent.oauthExpiresIn'),
      oauthExpiresAt: t('reportContent.oauthExpiresAt'),
      oauthRefreshToken: t('reportContent.oauthRefreshToken'),
      oauthIdToken: t('reportContent.oauthIdToken'),
      oauthYes: t('reportContent.oauthYes'),
      oauthNo: t('reportContent.oauthNo'),
    };
  }, [t, i18n.language]);
}
