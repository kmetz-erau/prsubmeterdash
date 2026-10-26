export type CommercialAccount = {
  account: string;
  description: string;
  utilityType: string;
  rate: string;
};

export const COMMERCIAL_ACCOUNTS: Record<string, CommercialAccount> = {
  AC8762: { account: 'AC8762', description: 'Campus Main — 3700 Willow Creek Rd.', utilityType: 'ELECTRIC-7450', rate: 'Large GS, Prim' },
  DP6724: { account: 'DP6724', description: 'B67 — service account 1168928905', utilityType: 'ELECTRIC-7450', rate: 'Extra Small GS' },
  '1700564': { account: '1700564', description: 'Main natural gas account', utilityType: 'NATURALGAS-7460', rate: 'T-1 — Transportation / Large Volume General' },
  '6012326': { account: '6012326', description: 'ERAU R1, R2, R3 natural gas account', utilityType: 'NATURALGAS-7460', rate: 'Small Volume Commercial Service' },
};

export function lookupCommercialAccount(account: string) {
  return COMMERCIAL_ACCOUNTS[account];
}
