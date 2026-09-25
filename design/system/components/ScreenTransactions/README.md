# ScreenTransactions
The immutable ledger of individual payments (section 15): ID (mono), date, user, plan, amount, fees, net, status — failed attempts kept (neutral, excluded from revenue), pending bank transfers shown as pending. The drawer shows every Transaction field: transactionId, user, subscription, plan + version, amount, payment fees (labelled *estimé* until settlement), net, provider, provider reference, payment date, metadata.

There is **no refund button, tab or status**. The drawer's `•••` menu holds *Ajustement exceptionnel…* for Super Admins only — reason code, note, second-admin approval, linked adjustment row, audit entry — an isolated administrative exception, not a workflow (Lock L40).
