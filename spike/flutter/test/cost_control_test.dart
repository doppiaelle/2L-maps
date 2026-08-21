import 'package:flutter_test/flutter_test.dart';
import 'package:twol_maps_spike/cost_control.dart';

void main() {
  test('ledger distinguishes product, HERE and ORS quotas and measures usage', () {
    final ledger = UsageLedger(quotas: {
      QuotaKind.product: const UsageQuota(kind: QuotaKind.product, used: 0, limit: 2),
      QuotaKind.here: const UsageQuota(kind: QuotaKind.here, used: 1, limit: 3),
      QuotaKind.ors: const UsageQuota(kind: QuotaKind.ors, used: 0, limit: 5),
    });
    final controller = CostController(
      ledger: ledger,
      subscription: const SubscriptionState(
        planId: 'free',
        active: true,
        features: {PlanFeature.routeOptimization},
      ),
    );
    controller.recordRoute(hereRequests: 1, orsRequests: 1);
    expect(ledger.quota(QuotaKind.here).remaining, 1);
    expect(ledger.quota(QuotaKind.ors).remaining, 4);
    expect(ledger.snapshot.routes, 1);
    expect(ledger.snapshot.hereRequests, 1);
    expect(ledger.snapshot.orsRequests, 1);
  });

  test('quota exhaustion is explicit and does not silently retry', () {
    final ledger = UsageLedger(quotas: {
      QuotaKind.here: const UsageQuota(kind: QuotaKind.here, used: 1, limit: 1),
      QuotaKind.ors: const UsageQuota(kind: QuotaKind.ors, used: 0, limit: 1),
    });
    final controller = CostController(
      ledger: ledger,
      subscription: const SubscriptionState(planId: 'free', active: true),
    );
    expect(
      () => controller.recordRoute(hereRequests: 1, orsRequests: 1),
      throwsA(isA<QuotaExceededException>()),
    );
    expect(ledger.snapshot.routes, 0);
  });

  test('subscription capabilities and expiry are enforced', () {
    final subscription = SubscriptionState(
      planId: 'pro',
      active: true,
      expiresAt: DateTime.utc(2026, 2, 1),
      features: const {PlanFeature.savedItineraries},
    );
    expect(subscription.includes(PlanFeature.savedItineraries,
        now: DateTime.utc(2026, 1, 1)), isTrue);
    expect(subscription.includes(PlanFeature.savedItineraries,
        now: DateTime.utc(2026, 3, 1)), isFalse);
  });

  test('request deduplicator shares concurrent provider work', () async {
    var calls = 0;
    final deduplicator = RequestDeduplicator();
    final futures = [
      deduplicator.run('same', () async { calls++; return 7; }),
      deduplicator.run('same', () async { calls++; return 8; }),
    ];
    expect(await Future.wait(futures), [7, 7]);
    expect(calls, 1);
  });
}
