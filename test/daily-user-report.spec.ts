import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDailyReportWindows,
  renderDailyReportHtml,
  renderDailyReportPlainText,
  runDailyUserReport,
  type DailyReportData,
} from '../src/modules/cron/daily-user-report.service.js';
import * as emailService from '../src/lib/email/email.service.js';
import * as usersRepo from '../src/modules/users/users.repo.js';
import * as adminRepo from '../src/modules/admin/admin.repo.js';
import { createApp } from '../src/app.js';

describe('daily-user-report', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDailyReportWindows', () => {
    it('computes exact IST boundaries for today and yesterday', () => {
      // 2026-08-19 02:30:00 UTC = 2026-08-19 08:00:00 IST
      const mockNow = new Date(Date.UTC(2026, 7, 19, 2, 30, 0));
      const windows = getDailyReportWindows(mockNow);

      // Today in IST starts at 2026-08-18 18:30:00 UTC
      expect(windows.todayTill8am.from.toISOString()).toBe('2026-08-18T18:30:00.000Z');
      // Today 8 AM IST is 2026-08-19 02:30:00 UTC
      expect(windows.todayTill8am.to.toISOString()).toBe('2026-08-19T02:30:00.000Z');

      // Yesterday in IST: 2026-08-17 18:30:00 UTC to 2026-08-18 18:30:00 UTC
      expect(windows.yesterday.from.toISOString()).toBe('2026-08-17T18:30:00.000Z');
      expect(windows.yesterday.to.toISOString()).toBe('2026-08-18T18:30:00.000Z');
    });
  });

  describe('render templates', () => {
    const mockData: DailyReportData = {
      generatedAtIST: '2026-08-19T08:00:00+05:30',
      dateIST: 'Wednesday, 19 August 2026',
      yesterdayDateIST: 'Tue, 18 Aug 2026',
      newUsersYesterday: 142,
      newUsersTodayTill8am: 28,
      activeUsersYesterday: 530,
      activeUsersTodayTill8am: 115,
      totalUsers: 12500,
      revenueYesterday: { totalPaise: 450000, count: 18 },
      revenueTodayTill8am: { totalPaise: 90000, count: 4 },
    };

    it('renders HTML email containing all 4 key metrics and aesthetic elements', () => {
      const html = renderDailyReportHtml(mockData);

      expect(html).toContain('New Users Yesterday');
      expect(html).toContain('142');
      expect(html).toContain('New Users Today (till 8 AM)');
      expect(html).toContain('28');
      expect(html).toContain('Active Users Yesterday');
      expect(html).toContain('530');
      expect(html).toContain('Active Users Today (till 8 AM)');
      expect(html).toContain('115');
      expect(html).toContain('Wednesday, 19 August 2026');
      expect(html).toContain('12,500');
    });

    it('renders plain text containing all metrics', () => {
      const text = renderDailyReportPlainText(mockData);

      expect(text).toContain('Total New Users Yesterday (Tue, 18 Aug 2026): 142');
      expect(text).toContain('New Users Today (00:00 - 08:00 IST): 28');
      expect(text).toContain('Active Users Yesterday: 530');
      expect(text).toContain('Active Users Today (00:00 - 08:00 IST): 115');
      expect(text).toContain('Total Registered Users: 12500');
    });
  });

  describe('runDailyUserReport service', () => {
    it('queries DB and dispatches email when recipients configured', async () => {
      vi.spyOn(usersRepo, 'usersCreatedBetween')
        .mockResolvedValueOnce(50) // yesterday
        .mockResolvedValueOnce(12); // today 8am
      vi.spyOn(usersRepo, 'usersActiveBetween')
        .mockResolvedValueOnce(200) // yesterday
        .mockResolvedValueOnce(45); // today 8am
      vi.spyOn(usersRepo, 'countUsers').mockResolvedValue(5000);
      vi.spyOn(adminRepo, 'sumPaidOrdersBetween')
        .mockResolvedValueOnce({ totalPaise: 20000, count: 2 })
        .mockResolvedValueOnce({ totalPaise: 5000, count: 1 });

      const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'msg-12345',
      });

      const result = await runDailyUserReport({
        recipientEmails: ['team@arohaastrology.in'],
      });

      expect(result.emailDispatched).toBe(true);
      expect(result.messageId).toBe('msg-12345');
      expect(result.data.newUsersYesterday).toBe(50);
      expect(result.data.newUsersTodayTill8am).toBe(12);
      expect(result.data.activeUsersYesterday).toBe(200);
      expect(result.data.activeUsersTodayTill8am).toBe(45);

      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      const callArg = sendEmailSpy.mock.calls[0][0];
      expect(callArg.to).toEqual(['team@arohaastrology.in']);
      expect(callArg.subject).toContain('50 new yesterday / 200 active');
    });
  });

  describe('POST /internal/cron/daily-user-report route', () => {
    it('requires valid cron secret', async () => {
      const app = createApp();

      const res = await app.request('/internal/cron/daily-user-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': 'wrong-secret',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(403);
    });

    it('successfully triggers daily report with valid secret', async () => {
      vi.spyOn(usersRepo, 'usersCreatedBetween').mockResolvedValue(10);
      vi.spyOn(usersRepo, 'usersActiveBetween').mockResolvedValue(30);
      vi.spyOn(usersRepo, 'countUsers').mockResolvedValue(100);
      vi.spyOn(adminRepo, 'sumPaidOrdersBetween').mockResolvedValue({ totalPaise: 0, count: 0 });
      vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-cron-msg',
      });

      const app = createApp();

      const res = await app.request('/internal/cron/daily-user-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': 'test-cron-secret',
        },
        body: JSON.stringify({
          recipientEmails: ['admin@arohaastrology.in'],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.emailDispatched).toBe(true);
      expect(json.recipients).toEqual(['admin@arohaastrology.in']);
      expect(json.data.newUsersYesterday).toBe(10);
    });
  });
});
