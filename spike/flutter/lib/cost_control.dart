enum QuotaKind { product, here, ors }

enum QuotaStatus { available, exhausted, unavailable }

class UsageQuota {
  const UsageQuota({
    required this.kind,
    required this.used,
    required this.limit,
    this.resetAt,
  });

  final QuotaKind kind;
  final int used;
  final int limit;
  final DateTime? resetAt;

  int get remaining => (limit - used).clamp(0, limit);
  QuotaStatus get status => limit <= 0
      ? QuotaStatus.unavailable
      : used >= limit
          ? QuotaStatus.exhausted
          : QuotaStatus.available;

  UsageQuota record([int amount = 1]) =>
      UsageQuota(kind: kind, used: used + amount, limit: limit, resetAt: resetAt);
}

enum PlanFeature { routeOptimization, liveRouting, savedItineraries, voiceNavigation }

class SubscriptionState {
  const SubscriptionState({
    required this.planId,
    required this.active,
    this.expiresAt,
    this.features = const {},
  });

  final String planId;
  final bool active;
  final DateTime? expiresAt;
  final Set<PlanFeature> features;

  bool includes(PlanFeature feature, {DateTime? now}) {
    if (!active) return false;
    final expiry = expiresAt;
    if (expiry != null && !(now ?? DateTime.now()).isBefore(expiry)) return false;
    return features.contains(feature);
  }
}

class CostSnapshot {
  const CostSnapshot({
    required this.routes,
    required this.hereRequests,
    required this.orsRequests,
  });

  final int routes;
  final int hereRequests;
  final int orsRequests;

  CostSnapshot add({int routes = 0, int hereRequests = 0, int orsRequests = 0}) =>
      CostSnapshot(
        routes: this.routes + routes,
        hereRequests: this.hereRequests + hereRequests,
        orsRequests: this.orsRequests + orsRequests,
      );
}

class UsageLedger {
  UsageLedger({
    required Map<QuotaKind, UsageQuota> quotas,
    CostSnapshot? snapshot,
  })  : _quotas = Map.of(quotas),
        snapshot = snapshot ?? const CostSnapshot(routes: 0, hereRequests: 0, orsRequests: 0);

  final Map<QuotaKind, UsageQuota> _quotas;
  CostSnapshot snapshot;

  UsageQuota quota(QuotaKind kind) =>
      _quotas[kind] ?? UsageQuota(kind: kind, used: 0, limit: 0);

  bool canConsume(QuotaKind kind, [int amount = 1]) =>
      quota(kind).status == QuotaStatus.available &&
      quota(kind).remaining >= amount;

  bool consume(QuotaKind kind, {int amount = 1, bool route = false}) {
    if (!canConsume(kind, amount)) return false;
    _quotas[kind] = quota(kind).record(amount);
    snapshot = snapshot.add(
      routes: route ? 1 : 0,
      hereRequests: kind == QuotaKind.here ? amount : 0,
      orsRequests: kind == QuotaKind.ors ? amount : 0,
    );
    return true;
  }
}

class QuotaExceededException implements Exception {
  const QuotaExceededException(this.kind);
  final QuotaKind kind;
  @override
  String toString() => 'Quota exceeded: $kind';
}

class ProviderTemporarilyUnavailable implements Exception {
  const ProviderTemporarilyUnavailable(this.provider);
  final String provider;
  @override
  String toString() => 'Provider temporarily unavailable: $provider';
}

abstract interface class UsageProvider {
  Future<UsageQuota> fetchQuota(QuotaKind kind);
}

abstract interface class SubscriptionProvider {
  Future<SubscriptionState> current();
  Future<void> restorePurchases();
}

class CostController {
  CostController({
    required this.ledger,
    required this.subscription,
  });

  final UsageLedger ledger;
  final SubscriptionState subscription;

  void require(QuotaKind kind, {int amount = 1, PlanFeature? feature}) {
    if (feature != null && !subscription.includes(feature)) {
      throw StateError('Feature not included in current plan: $feature');
    }
    if (!ledger.canConsume(kind, amount)) {
      throw QuotaExceededException(kind);
    }
  }

  void recordRoute({required int hereRequests, required int orsRequests}) {
    require(QuotaKind.here, amount: hereRequests);
    require(QuotaKind.ors, amount: orsRequests);
    ledger.consume(QuotaKind.here, amount: hereRequests);
    ledger.consume(QuotaKind.ors, amount: orsRequests, route: true);
  }
}

class RequestDeduplicator {
  final _inFlight = <String, Future<Object?>>{};

  Future<T> run<T>(String key, Future<T> Function() operation) {
    final existing = _inFlight[key];
    if (existing != null) return existing.then((value) => value as T);
    final request = operation();
    _inFlight[key] = request;
    request.whenComplete(() => _inFlight.remove(key));
    return request;
  }
}
