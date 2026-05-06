import { Platform } from 'react-native';

export const IAP_PRODUCT_SKUS = {
  MONTHLY_PRO: 'monthly_pro',
} as const;

export type IAPProductId = (typeof IAP_PRODUCT_SKUS)[keyof typeof IAP_PRODUCT_SKUS];

let isInitialized = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Product = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Purchase = any;

// Dynamically import native modules only on native platforms
async function getIapModule() {
  if (Platform.OS === 'web') return null;
  
  const mod = await import('react-native-iap');
  return mod;
}

async function getInitConnection() {
  const mod = await getIapModule();
  if (!mod) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).initConnection as any;
}

async function getFetchProducts() {
  const mod = await getIapModule();
  if (!mod) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).fetchProducts as any;
}

async function getRequestPurchase() {
  const mod = await getIapModule();
  if (!mod) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).requestPurchase as any;
}

async function getReceiptData() {
  const mod = await getIapModule();
  if (!mod) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).getReceiptDataIOS as any;
}

export const initializeIAP = async (): Promise<boolean> => {
  if (!shouldUseIAP) return false;
  if (isInitialized) return true;
  
  try {
    const initFn = await getInitConnection();
    if (!initFn) return false;
    
    await initFn();
    isInitialized = true;
    console.log('IAP initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize IAP:', error);
    return false;
  }
};

export const getSubscriptionProducts = async (): Promise<Product[]> => {
  if (!shouldUseIAP) return [];
  
  try {
    const fetchFn = await getFetchProducts();
    if (!fetchFn) return [];
    
    const products = await fetchFn({
      skus: [IAP_PRODUCT_SKUS.MONTHLY_PRO],
      type: 'subs',
    });
    return (products as Product[]) || [];
  } catch (error) {
    console.error('Failed to get subscription products:', error);
    return [];
  }
};

export const getNonSubscriptionProducts = async (skus: string[]): Promise<Product[]> => {
  if (!shouldUseIAP) return [];
  
  try {
    const fetchFn = await getFetchProducts();
    if (!fetchFn) return [];
    
    const products = await fetchFn({ skus, type: 'in-app' });
    return (products as Product[]) || [];
  } catch (error) {
    console.error('Failed to get products:', error);
    return [];
  }
};

export const purchaseSubscription = async (productId: string): Promise<{
  success: boolean;
  transactionId?: string;
  receipt?: string;
  error?: string;
}> => {
  if (!shouldUseIAP) {
    return { success: false, error: 'IAP not available on this platform' };
  }
  
  try {
    const purchaseFn = await getRequestPurchase();
    if (!purchaseFn) return { success: false, error: 'IAP not available' };
    
    const purchases = await purchaseFn({
      type: 'subs',
      request: Platform.OS === 'ios' 
        ? { apple: { sku: productId } }
        : { google: { skus: [productId] } },
    });
    
    let receipt: string | null = null;
    let transactionId: string | undefined;
    
    if (Platform.OS === 'ios') {
      const receiptFn = await getReceiptData();
      if (receiptFn) {
        const receiptResult = await receiptFn();
        if (receiptResult) {
          receipt = receiptResult;
        }
      }
    }

    if (purchases) {
      const purchase = Array.isArray(purchases) ? purchases[0] : purchases;
      transactionId = purchase?.transactionId ?? undefined;
    }

    return {
      success: true,
      transactionId,
      receipt: receipt ?? undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Purchase failed:', errorMessage);
    
    if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
      return { success: false, error: 'cancelled' };
    }
    
    return { success: false, error: errorMessage };
  }
};

export const finishPurchase = async (purchase: Purchase): Promise<boolean> => {
  if (!shouldUseIAP) return false;
  
  try {
    const mod = await getIapModule();
    if (!mod) return false;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (mod as any).finishTransaction({ purchase });
    return true;
  } catch (error) {
    console.error('Failed to finish transaction:', error);
    return false;
  }
};

export const getAvailableSubscriptions = async (): Promise<Purchase[]> => {
  if (!shouldUseIAP) return [];
  
  try {
    const mod = await getIapModule();
    if (!mod) return [];
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const purchases = await (mod as any).getAvailablePurchases();
    return purchases as Purchase[];
  } catch (error) {
    console.error('Failed to get available purchases:', error);
    return [];
  }
};

export const endIAPConnection = async (): Promise<void> => {
  try {
    const mod = await getIapModule();
    if (mod) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mod as any).endConnection();
    }
    isInitialized = false;
  } catch (error) {
    console.error('Failed to end IAP connection:', error);
  }
};

export const isIOS = Platform.OS === 'ios';

export const shouldUseIAP = Platform.OS === 'ios';