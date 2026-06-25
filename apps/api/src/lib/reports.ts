export type ReportTier = 'basic' | 'standard' | 'premium';

export type GenerateReportResult = {
  success: boolean;
  reportId: string | null;
  reused?: boolean;
  status?: string;
  error?: string;
  code?: string;
};

export async function generateReport(chartId: string, tier: ReportTier): Promise<GenerateReportResult> {
  try {
    const res = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartId, tier }),
    });
    const json = await res.json().catch(() => null) as
      | { success: boolean; data?: { report_id?: string; status?: string; reused?: boolean }; error?: string; code?: string }
      | null;
    if (!res.ok || !json?.success) {
      return {
        success: false,
        reportId: null,
        error: json?.error ?? `HTTP ${res.status}`,
        code: json?.code,
      };
    }
    return {
      success: true,
      reportId: json.data?.report_id ?? null,
      reused: json.data?.reused,
      status: json.data?.status,
    };
  } catch (err) {
    return { success: false, reportId: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}
