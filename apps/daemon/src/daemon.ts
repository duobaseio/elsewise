import { type Channel, serve } from '@elsewise/transport';
import { InfoService } from './gen/elsewise/daemon/v1/info_service_pb';
import { InfoServiceImpl } from './info/service';

export interface Daemon {
  /** Serves daemon services on the given channel. */
  register(channel: Channel): void;
}

/** Bootstraps the daemon. */
export function createDaemon(): Daemon {
  const info = new InfoServiceImpl();

  return {
    register(channel) {
      serve(channel, InfoService, info);
    },
  };
}
