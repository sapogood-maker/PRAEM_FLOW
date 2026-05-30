class ConflictResolution {
  final bool conflict;
  final String resolution;
  final String reason;

  const ConflictResolution({
    required this.conflict,
    required this.resolution,
    required this.reason,
  });
}

class ConflictResolver {
  ConflictResolution resolve({
    required Map<String, dynamic> event,
    required Map<String, dynamic> serverState,
  }) {
    final type = (event['type'] as String? ?? '').toUpperCase();
    final serverStatus = (serverState['status'] as String? ?? '').toUpperCase();

    final terminal = {'COMPLETED', 'CANCELLED', 'NO_SHOW'};
    if (terminal.contains(serverStatus) && {
      'BOARDING',
      'TRIP_STARTED',
      'ARRIVED',
      'TRIP_COMPLETED',
      'ROUTE_STARTED',
      'ROUTE_COMPLETED',
    }.contains(type)) {
      return const ConflictResolution(
        conflict: true,
        resolution: 'server_authoritative',
        reason: 'Server state is terminal and overrides offline mutation.',
      );
    }

    if (type == 'ROUTE_REOPEN' && serverStatus == 'COMPLETED') {
      return const ConflictResolution(
        conflict: true,
        resolution: 'server_authoritative',
        reason: 'Route already completed online.',
      );
    }

    return const ConflictResolution(
      conflict: false,
      resolution: 'merge',
      reason: 'No operational conflict detected.',
    );
  }
}
