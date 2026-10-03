import { opened, type Socket, SocketWire, type SocketWireOptions } from './socket';

/** The RTCDataChannel interface.  */
export type DataChannel = Socket & {
  bufferedAmountLowThreshold: number;
  addEventListener(type: 'bufferedamountlow', listener: () => void, options?: { once?: boolean }): void;
};

export type DataChannelWireOptions = SocketWireOptions;

/**
 * The `Wire` over an open RTCDataChannel.
 *
 * The implementations do not register heartbeat as liveness is handled within the WebRTC protocol.
 */
export class DataChannelWire extends SocketWire {
  /** Resolves to a wire once the channel is open. */
  static open(channel: DataChannel, options?: DataChannelWireOptions): Promise<DataChannelWire> {
    return opened(channel).then((channel) => new DataChannelWire(channel, options));
  }

  constructor(channel: DataChannel, options?: DataChannelWireOptions) {
    super(channel, options);
    channel.bufferedAmountLowThreshold = this.lowWaterMark;
    channel.addEventListener('bufferedamountlow', () => this.drained());
  }

  protected override watchDrain(): void {
    // Handled by the `bufferedamountlow` listener.
  }
}
