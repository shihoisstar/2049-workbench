import { z } from 'zod';

/** 充值档位(T1.4;定价随成本推演校准,BIZ-01/02)。 */
export const StorePackage = z.object({
  id: z.string(),
  label: z.string(),
  credits: z.number().int().positive(),
  priceCents: z.number().int().positive(),
});
export type StorePackage = z.infer<typeof StorePackage>;

export const StorePackages = z.object({ packages: z.array(StorePackage) });
export type StorePackages = z.infer<typeof StorePackages>;

export const CreateOrderRequest = z.object({ packageId: z.string().min(1) });
export type CreateOrderRequest = z.infer<typeof CreateOrderRequest>;

export const OrderStatus = z.enum(['created', 'paid', 'closed']);
export type OrderStatus = z.infer<typeof OrderStatus>;

/** 订单(第三账本:支付单据;PaymentLog 回调明细随真实微信支付接入)。 */
export const StoreOrder = z.object({
  id: z.string(),
  packageId: z.string(),
  credits: z.number().int().positive(),
  priceCents: z.number().int().positive(),
  status: OrderStatus,
  createdAt: z.string(),
});
export type StoreOrder = z.infer<typeof StoreOrder>;

export const StoreOrders = z.object({ orders: z.array(StoreOrder) });
export type StoreOrders = z.infer<typeof StoreOrders>;
