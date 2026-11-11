/**
 * Off (coordinator QW4R-5, backend A4T-1, FU2R item 4). The rows are now read as the backend serves
 * them (one original till row each, `amount` before VAT and discounts, or null), and `reprintReady`
 * checks every row and the READY QR. It stays off until the coordinator confirms the lift: while
 * this is false no reprint prints, whatever the server sends.
 */
export const REPRINT_LINES_SETTLED: boolean = false
