# PINT-OM line classification — HS code, service type, industrial classification

**Date:** 25 September 2026 · **For:** the backend team · **Companion to:** `INCOME_DESIGN_REALIGNMENT_BACKEND_ASKS.md` §3

## Summary — which codes apply to which invoice type

| Invoice type | Goods / service flag (per line) | HS code (goods lines) | Service type (service lines) | Industrial classification (ISIC) |
|---|---|---|---|---|
| Full tax invoice, B2B | required | required | required | required (copied from the tenant) |
| Full tax invoice, B2G | required | required | required | required (copied from the tenant) |
| Simplified invoice, B2C at the point of sale | not required | not required | not required | not required |
| Credit note / debit note against a full invoice | as the invoice it corrects | as the invoice | as the invoice | as the invoice |

The goods / service flag is **per line**. One invoice can carry goods lines and service lines
together; each line is classified on its own.

## 1. What each code is and what it classifies

| Code | Classifies | Chosen by | Where it lives |
|---|---|---|---|
| **HS code** (Harmonized System, Oman's 12-digit national extension) | the **product being sold** on a goods line | the user, per line, by searching the product name — results read like "Coffee, roasted, not decaffeinated" | on the line |
| **Service type** | the **service supplied** on a service line | the user, per line, by searching the service name | on the line |
| **Industrial classification** (ISIC Rev. 4, Oman's 6-digit code) | the **business issuing the invoice** | set once in Company settings; never asked on the invoice form | on the tenant; the backend copies it into every line |

## 2. When each is mandatory — rule identifiers and conditions

| Rule | Condition |
|---|---|
| **IBR-078-OM** | Every line on a full tax invoice carries the goods / service flag. Simplified invoices are exempt. |
| **IBR-079-OM** | When the line is goods, the line carries an HS code. |
| **IBR-080-OM** | The HS code is exactly 12 digits (Oman's national extension of the 6-digit HS). |
| **IBR-081-OM** | Every line on a full tax invoice carries the industrial classification of the issuer. |
| **IBR-155-OM** and code list **CL-12-OM** | When the line is a service, the line carries a service type from the CL-12-OM list. |

**Simplified invoices** (B2C at the point of sale, the `Consumer` customer type in the composer)
require none of the above. The composer hides the flag, the HS search and the service type search
for that customer type, and sends nothing for them.

## 3. Where each value comes from

- **HS code** and **service type**: chosen per line by the user through a search by name. The
  composer shows the HS search on goods lines and the service type search on service lines, for
  business and government customers only.
- **Industrial classification**: a company-level setting. The user picks it once in Settings ›
  Company (search by name, full 6-digit code, not the 2-digit division). It is stored on the
  tenant and the backend copies it into every line at submission. It is never asked on the
  invoice form.

## 4. XML binding, with a goods line and a service line on the same invoice

The two lines below belong to one full tax invoice. Placeholders in angle brackets are values the
backend fills from the code lists; everything else is the shape.

```xml
<!-- Line 1 — goods -->
<cac:InvoiceLine>
  <cbc:ID>1</cbc:ID>
  <cbc:InvoicedQuantity unitCode="KGM">4</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="OMR">34.200</cbc:LineExtensionAmount>
  <cac:Item>
    <cbc:Name>Coffee beans 1 kg, house blend</cbc:Name>
    <!-- HS code: cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode, listID="HS" -->
    <cac:CommodityClassification>
      <cbc:ItemClassificationCode listID="HS">090121000000</cbc:ItemClassificationCode>
    </cac:CommodityClassification>
    <!-- Industrial classification of the issuer, copied by the backend on every line -->
    <cac:CommodityClassification>
      <cbc:ItemClassificationCode listID="<industrial-classification listID from the codelist>">561010</cbc:ItemClassificationCode>
    </cac:CommodityClassification>
    <cac:ClassifiedTaxCategory>
      <cbc:ID>S</cbc:ID>
      <cbc:Percent>5</cbc:Percent>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:ClassifiedTaxCategory>
    <!-- Goods / service flag: cac:Item/cac:ItemSpecificationDocumentReference/cbc:DocumentTypeCode,
         with schemeName="MP" on cbc:ID -->
    <cac:ItemSpecificationDocumentReference>
      <cbc:ID schemeName="MP"><line item identifier></cbc:ID>
      <cbc:DocumentTypeCode><goods token from the goods/service code list></cbc:DocumentTypeCode>
    </cac:ItemSpecificationDocumentReference>
  </cac:Item>
  <cac:Price>
    <cbc:PriceAmount currencyID="OMR">9.500</cbc:PriceAmount>
  </cac:Price>
</cac:InvoiceLine>

<!-- Line 2 — service -->
<cac:InvoiceLine>
  <cbc:ID>2</cbc:ID>
  <cbc:InvoicedQuantity unitCode="HUR">4</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="OMR">36.000</cbc:LineExtensionAmount>
  <cac:Item>
    <cbc:Name>Barista training, September session</cbc:Name>
    <!-- Service type from CL-12-OM, on the same classification element with the service list id -->
    <cac:CommodityClassification>
      <cbc:ItemClassificationCode listID="<service-type listID from the codelist>"><CL-12-OM code></cbc:ItemClassificationCode>
    </cac:CommodityClassification>
    <cac:CommodityClassification>
      <cbc:ItemClassificationCode listID="<industrial-classification listID from the codelist>">561010</cbc:ItemClassificationCode>
    </cac:CommodityClassification>
    <cac:ClassifiedTaxCategory>
      <cbc:ID>S</cbc:ID>
      <cbc:Percent>5</cbc:Percent>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:ClassifiedTaxCategory>
    <cac:ItemSpecificationDocumentReference>
      <cbc:ID schemeName="MP"><line item identifier></cbc:ID>
      <cbc:DocumentTypeCode><service token from the goods/service code list></cbc:DocumentTypeCode>
    </cac:ItemSpecificationDocumentReference>
  </cac:Item>
  <cac:Price>
    <cbc:PriceAmount currencyID="OMR">9.000</cbc:PriceAmount>
  </cac:Price>
</cac:InvoiceLine>
```

Fixed by the specification: the goods / service flag sits in
`cac:Item/cac:ItemSpecificationDocumentReference/cbc:DocumentTypeCode` with `schemeName="MP"` on
`cbc:ID`; the HS code sits in `cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode`
with `listID="HS"`. The exact tokens for the goods / service flag, the `listID` for the service
type and the `listID` for the industrial classification come from the code lists in §5 — take
them from there rather than from this page.

## 5. Source code lists and where to get them

| List | Where |
|---|---|
| HS codes, 12 digits, from the Royal Oman Police Directorate General of Customs | `https://docs.peppol.eu/poac/om/pint-om/trn-invoice/codelist/HSCodes-1` and `…/codelist/HSCodes-2` — split in two because of size |
| Service types (CL-12-OM) | the same `/codelist/` folder |
| Industrial classification (ISIC, Oman 6-digit) | the same `/codelist/` folder |
| Goods / service flag tokens | the same `/codelist/` folder |

`com.helger.peppol:peppol-om` on Maven carries the PINT-OM Schematron and these code lists as a
maintained dependency, from the same author as the phive library already in the stack. Prefer it
to hand-copied lists.

## 6. The "Other" fallback

HS code `000000000000` is a valid value. A user who cannot classify a product picks "Other" in
the HS search and can still issue a valid invoice; the composer maps "Other" to that code.

## 7. What the backend must provide to the front end

1. **Search endpoints** returning `{ code, name }` (English and Arabic names) for
   - HS codes: `GET /v1/code-lists/hs?q=coffee` — searched by product name, paged, 12-digit codes,
     "Other" (`000000000000`) always findable;
   - service types (CL-12-OM): `GET /v1/code-lists/service-types?q=training`.
   The front end ships small placeholder subsets until these exist.
2. **The tenant's industrial classification**: read and write on the company settings resource
   (`GET/PUT /v1/settings/company`, field `industrialClassification` with the 6-digit code and the
   name), plus a search endpoint `GET /v1/code-lists/isic?q=` for the picker.
3. **Draft line fields**: `lines[].itemType` (`GOODS` \| `SERVICE`), `lines[].hsCode` (12 digits,
   goods only), `lines[].serviceType` (CL-12-OM code, services only). The industrial classification
   is **not** a line field on the draft; the backend copies the tenant's value at submission.
4. **Validation before submission, not after**: a goods line on a full tax invoice with no HS code,
   a service line with no service type, or a tenant with no industrial classification is refused
   when the draft is issued (`POST /v1/invoice-drafts/{id}/issue`), with a problem detail naming
   the line and the rule (`IBR-079-OM`, `IBR-155-OM`, `IBR-081-OM`), so the composer can point at
   the line. Simplified invoices skip all three checks.
