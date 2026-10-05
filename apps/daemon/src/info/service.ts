import type { ServiceImpl } from '@elsewise/transport';
import manifest from '../../package.json' with { type: 'json' };
import type { InfoService } from '../gen/elsewise/daemon/v1/info_service_pb';

/** The `InfoService`. */
export class InfoServiceImpl implements ServiceImpl<typeof InfoService> {
  getInfo() {
    return { version: manifest.version };
  }
}
