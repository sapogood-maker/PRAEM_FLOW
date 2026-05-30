export '../offline_sync/offline_queue_service.dart' show OfflineQueueService;

import '../offline_sync/offline_queue_service.dart';
import '../offline_sync/offline_storage_service.dart';

class OfflineQueue extends OfflineQueueService {
  OfflineQueue() : super(OfflineStorageService());
}
