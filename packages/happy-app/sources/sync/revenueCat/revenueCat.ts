import {
    RevenueCatInterface,
    CustomerInfo,
    Product,
    Offerings,
    PurchaseResult,
    RevenueCatConfig,
    LogLevel,
    PaywallResult,
    PaywallOptions
} from './types';

class RevenueCatStub implements RevenueCatInterface {
    configure(config: RevenueCatConfig): void { /* no-op */ }

    async getCustomerInfo(): Promise<CustomerInfo> {
        return {
            activeSubscriptions: {},
            entitlements: { all: { pro: { isActive: true, identifier: 'pro' } } },
            originalAppUserId: '',
            requestDate: new Date()
        };
    }

    async getOfferings(): Promise<Offerings> { return { current: null, all: {} }; }
    async getProducts(productIds: string[]): Promise<Product[]> { return []; }

    async purchaseStoreProduct(product: Product): Promise<PurchaseResult> {
        return { customerInfo: await this.getCustomerInfo() };
    }

    async syncPurchases(): Promise<void> { /* no-op */ }
    setLogLevel(level: LogLevel): void { /* no-op */ }

    async presentPaywall(options?: PaywallOptions): Promise<PaywallResult> {
        return PaywallResult.NOT_PRESENTED;
    }

    async presentPaywallIfNeeded(options?: PaywallOptions & { requiredEntitlementIdentifier: string }): Promise<PaywallResult> {
        return PaywallResult.NOT_PRESENTED;
    }
}

export default new RevenueCatStub();
