import { createBackgroundServices, registerBackgroundBridgeHandlers } from './bridgeHandlers';

const services = createBackgroundServices();
registerBackgroundBridgeHandlers(services);

console.log('Context Tools Extension: Ext background initialized');
