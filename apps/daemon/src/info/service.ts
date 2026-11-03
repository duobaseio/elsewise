import type { ServiceImpl } from '@elsewise/transport';
import type { InfoService } from '../gen/elsewise/daemon/info/v1/info_service_pb';
import { VERSION } from '../global';

/** The `InfoService`. */
export class InfoServiceImpl implements ServiceImpl<typeof InfoService> {
  getInfo() {
    return { version: VERSION };
  }
}
