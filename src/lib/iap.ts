import { Platform } from 'react-native';
import { fetchProducts, initConnection, requestPurchase, getReceiptDataIOS, finishTransaction, getAvailablePurchases, endConnection } from 'react-native-iap';

export const IAP_PRODUCT_SKUS = {
  MONTHLY_PRO: 'monthly_pro',
} as const;

export type IAPProductId = (typeof IAP_PRODUCT_SKUS)[keyof typeof IAP_PRODUCT_SKUS];

let isInitialized = false;

type Product = any;
type Purchase = any;

const shouldUseIAP = Platform.OS === 'ios';

export const initializeIAP = async (): Promise<boolean> => {
  if (!shouldUseIAP) return false;
  if (isInitialized) return true;
  
  try {
    const result = await initConnection();
    console.log('IAP init result:', result);
    isInitialized = true;
    return result;
  } catch (error) {
    console.error('Failed to initialize IAP:', error);
    return false;
  }
};

export const getSubscriptionProducts = async (): Promise<Product[]> => {
  if (!shouldUseIAP) return [];
  
  try {
    console.log('Fetching with SKU:', IAP_PRODUCT_SKUS.MONTHLY_PRO);
    
    // Try fetching ALL subscription products (no SKU filter)
    const allProducts = await fetchProducts({ type: 'subs' });
    console.log('All subscription products:', allProducts);
    
    // Also try with specific SKU
    const products = await fetchProducts({ 
      skus: [IAP_PRODUCT_SKUS.MONTHLY_PRO], 
      type: 'subs' 
    });
    console.log('Specific products:', products);
    
    return products || allProducts || [];
  } catch (error) {
    console.error('Failed to get subscription products:', error);
    return [];
  }
};

export const getNonSubscriptionProducts = async (skus: string[]): Promise<Product[]> => {
  if (!shouldUseIAP) return [];
  
  try {
    const products = await fetchProducts({ skus, type: 'in-app' });
    return products || [];
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
    const purchases = await requestPurchase({
      type: 'subs',
      request: Platform.OS === 'ios' 
        ? { apple: { sku: productId } }
        : { google: { skus: [productId] } },
    });
    
    let receipt: string | null = null;
    let transactionId: string | undefined;
    
    if (Platform.OS === 'ios') {
      try {
        receipt = await getReceiptDataIOS();
      } catch (e) {
        console.log('Could not get receipt:', e);
      }
    }

    const purchaseList = Array.isArray(purchases) ? purchases : purchases ? [purchases] : [];
    
    if (purchaseList.length > 0) {
      const purchase = purchaseList[0];
      transactionId = purchase?.transactionId ?? undefined;
      
      if (purchase) {
        try {
          await finishTransaction({ purchase });
        } catch (e) {
          console.log('Could not finish transaction:', e);
        }
      }
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

export const getAvailableSubscriptions = async (): Promise<Purchase[]> => {
  if (!shouldUseIAP) return [];
  
  try {
    const purchases = await getAvailablePurchases();
    return purchases || [];
  } catch (error) {
    console.error('Failed to get available purchases:', error);
    return [];
  }
};

export const endIAPConnection = async (): Promise<void> => {
  try {
    await endConnection();
    isInitialized = false;
  } catch (error) {
    console.error('Failed to end IAP connection:', error);
  }
};

export const finishPurchase = async (purchase: Purchase): Promise<boolean> => {
  if (!shouldUseIAP) return false;
  
  try {
    await finishTransaction({ purchase });
    return true;
  } catch (error) {
    console.error('Failed to finish transaction:', error);
    return false;
  }
};

export const isIOS = Platform.OS === 'ios';
export { shouldUseIAP };