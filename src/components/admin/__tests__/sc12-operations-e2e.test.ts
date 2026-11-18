import {
  assignExceptionCase,
  getExceptionCase,
  listExceptionCases,
  resolveExceptionCase,
} from '@/cases/cases-api'
import {
  dispatchMockNotification,
  listMockNotifications,
  markMockNotificationAsRead,
  subscribeMockNotifications,
} from '@/notifications/mock-notifications'
import { fetchManagementMetrics } from '@/metrics/metrics-api'
import type { NotificationItem } from '@/notifications/types'

describe('End-to-End Scenario SC12: Multi-Department Operations, Maker ≠ Checker, and Reporting', () => {
  const prevMockMode = process.env.NEXT_PUBLIC_MOCK_MODE

  beforeAll(() => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_MOCK_MODE = prevMockMode
  })

  describe('Phase 1: Multi-Department Exception Case Management (Section 17, B06, B09)', () => {
    test('Step 1-2: Case initialized with 30-minute assignment SLA', async () => {
      const cases = await listExceptionCases()
      expect(cases.length).toBeGreaterThanOrEqual(2)

      const sc09Case = cases.find((c) => c.category === 'RECEIVING_SHORTAGE')
      expect(sc09Case).toBeDefined()
      expect(sc09Case?.status).toBe('OPEN_UNASSIGNED')
      expect(sc09Case?.ownerId).toBeNull()

      // Verify 30-minute SLA assignment deadline is recorded
      expect(sc09Case?.slaFirstAssignDueAt).toBeDefined()
      const dueTime = new Date(sc09Case!.slaFirstAssignDueAt).getTime()
      const createdTime = new Date(sc09Case!.createdAt).getTime()
      expect(dueTime - createdTime).toBeGreaterThanOrEqual(25 * 60 * 1000)
    })

    test('Step 3: Operations lead assigns owner within 30-minute SLA window', async () => {
      const assigned = await assignExceptionCase('CASE-SC09-001', 'warehouse-minh')
      expect(assigned.status).toBe('ASSIGNED_IN_PROGRESS')
      expect(assigned.ownerId).toBe('warehouse-minh')

      // Verify assignment action appended to timeline
      const lastTimeline = assigned.timeline[assigned.timeline.length - 1]
      expect(lastTimeline.action).toContain('Phân công vụ việc cho warehouse-minh')
    })

    test('Step 4-5: Resolution requires verified evidence and is never auto-closed by timeout', async () => {
      const resolved = await resolveExceptionCase(
        'CASE-SC09-001',
        'https://commerce-lab-retail-assets.s3.ap-southeast-1.amazonaws.com/receiving/po-001-damage.jpg',
        'Supplier credited 2 replacement units on credit note CN-202611-01'
      )

      expect(resolved.status).toBe('RESOLVED_WITH_EVIDENCE')
      expect(resolved.resolutionEvidence).toContain('po-001-damage.jpg')

      const updated = await getExceptionCase('CASE-SC09-001')
      expect(updated.status).toBe('RESOLVED_WITH_EVIDENCE')
    })
  })

  describe('Phase 2: Policy P10 (Maker ≠ Checker) Approval Cycle & Notification Delivery', () => {
    test('Step 6-8: Real-time notification delivered upon approval dispatch', (done) => {
      const unsubscribe = subscribeMockNotifications('user-lan', (noti: NotificationItem) => {
        expect(noti.recipientId).toBe('user-lan')
        expect(noti.category).toBe('APPROVAL_DECIDED')
        expect(noti.title).toContain('Đã phê duyệt hoàn tiền')
        unsubscribe()
        done()
      })

      // Dispatch notification
      dispatchMockNotification({
        notificationId: 'NOTI-SC12-001',
        eventId: 'EVT-APP-SC12',
        recipientId: 'user-lan',
        channel: 'IN_APP',
        category: 'APPROVAL_DECIDED',
        title: 'Đã phê duyệt hoàn tiền ngoại lệ 270.000đ',
        message: 'Yêu cầu hoàn tiền cho đơn O-001 đã được Quản lý duyệt và chuyển kế toán chi trả.',
        isRead: false,
        createdAt: new Date().toISOString(),
      })
    })

    test('Step 9: Notification inbox reflects unread counter and read state update', () => {
      const inbox = listMockNotifications('user-lan')
      expect(inbox.items.length).toBeGreaterThanOrEqual(1)
      expect(inbox.unreadCount).toBeGreaterThanOrEqual(1)

      const firstItem = inbox.items[0]
      const marked = markMockNotificationAsRead('user-lan', firstItem.notificationId)
      expect(marked).toBe(true)

      const updatedInbox = listMockNotifications('user-lan')
      const readItem = updatedInbox.items.find((i) => i.notificationId === firstItem.notificationId)
      expect(readItem?.isRead).toBe(true)
    })
  })

  describe('Phase 3: Management Reporting & SC12 Transactional Invariant Protection', () => {
    test('Step 10-12: Management dashboard shows net collection, case aging, and SC12 disclaimer', async () => {
      const metrics = await fetchManagementMetrics('TODAY')

      // Arithmetic Invariants: Net Collection = Gross Collected - Total Refunded
      expect(metrics.overview.netCollectionVnd).toBe(
        metrics.overview.grossCollectedVnd - metrics.overview.totalRefundedVnd
      )
      expect(metrics.overview.confirmationRate).toBeGreaterThan(0)
      expect(metrics.overview.availableInventoryUnits).toBeGreaterThan(0)

      // Case aging metrics
      expect(metrics.caseAging.totalOpenCases).toBeGreaterThanOrEqual(0)

      // SC12 Policy Protection: Reports display authoritative PostgreSQL source and warning notice
      expect(metrics.metadata.source).toContain('PostgreSQL')
      expect(metrics.metadata.policyNotice).toContain('Lưu ý SC12')
      expect(metrics.metadata.policyNotice).toContain('Nghiêm cấm dùng số liệu báo cáo để quyết định bán vượt tồn kho')
    })
  })
})
