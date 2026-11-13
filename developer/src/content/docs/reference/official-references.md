---
title: "Official references"
description: "This page lists the official specifications and pages this guide relies on, so you can check a rule at its source."
sidebar:
  label: "Official references"
  order: 3
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This page lists the official specifications and pages this guide relies on, so you can check a rule at its source. Each source in the main tables was opened and read when the guide was written (November 2026). Versions and dates are as the source itself states them.

Where this guide labels a rule <span class="rule rule--ota">Regulation (OTA)</span> or <span class="rule rule--pint">PINT-OM rule</span>, the authority is one of the sources below. A <span class="rule rule--fawtir">FAWTIR rule</span> is platform behaviour and is not found in these sources.

:::note
FAWTIR validates documents against the PINT-OM 1.0.1 rule set. Rules can change between versions. Always compare a rule ID with the version you are reading.
:::

## PINT-OM and Oman Peppol specifications

| Official title | Version | Date | URL | What to use it for |
|---|---|---|---|---|
| Oman Specifications (index) | PDK 1.4.4 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/ | Entry point to the three Oman specifications below |
| PINT OM Billing Process | 1.0.1 | 29 Jul 2026 (PDK release date) | https://docs.peppol.eu/poac/om/pint-om/ | Content and rules of the invoice and credit note |
| Peppol International (PINT) model for Billing, Oman BIS document | Page header shows v1.1.3, the PINT base version | Last updated 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/bis/ | Narrative: identifiers, rounding, the baisa precision model, the transaction type model, document references |
| Release notes for PINT OM Billing | 1.0.1 (Final, maintained by Oman Tax Authority; built on PINT 1.1.3) | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/specialized-release-notes/ | Changes since 1.0.0, including UUID version 5 and the baisa tolerance warnings |
| Oman specific PINT rules (Invoice) | 1.0.1 / PDK 1.4.4 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/rule/PINT-jurisdiction-aligned-rules/ | The `-OM` rule IDs and messages. Each rule has its own page, for example `.../rule/IBR-079-OM/` |
| Shared PINT rules (Invoice) | 1.0.1 / PDK 1.4.4 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/rule/PINT-UBL-validation-preprocessed/ | The general PINT rules (`ibr-xxx`, `ibr-co-xx`), including the two-decimal total rules |
| Rules (Invoice Transaction Rules) | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/businessrule/ | General PINT rule statements. The Oman rules are on the page above. |
| Credit Note transaction | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-creditnote/ | Credit note syntax, rules and code lists |
| PINT OM Self-Billing Process | 1.0.1 | 29 Jul 2026 (PDK) | https://docs.peppol.eu/poac/om/pint-om-sb/ | Self-billed invoice (389) and self-billed credit note (261) |
| Peppol International (PINT) model for Billing, Oman Self-Billing BIS document | Page header shows v1.1.3, the PINT base version | Last updated 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om-sb/bis/ | Self-billing identifiers and narrative |
| Oman Tax Data Document Process | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/om-tdd/ | The Tax Data Document (TDD) a service provider reports to the Tax Authority |
| Peppol model for Tax Data Document (BIS) | Page header shows v1.0.2 | Last updated 29 Jul 2026 | https://docs.peppol.eu/poac/om/om-tdd/bis/ | How the TDD travels from the service providers to the Tax Authority over Peppol |
| Release notes for Tax Data Document | 1.0.1 (Final, maintained by OTA) | 29 Jul 2026 | https://docs.peppol.eu/poac/om/om-tdd/release-notes/ | Changes since TDD 1.0.0 |
| OpenPeppol Post-Award Documentation | Lists PINT BIS Billing Oman 1.0.1, PINT BIS Self Billing Oman 1.0.1, TDD Oman 1.0.1 | Published and mandatory 29 Jul 2026 | https://peppol.org/documentation/technical-documentation/post-award-documentation/ | Confirms that the Oman specifications are published by OpenPeppol |

## Peppol transport (AS4, SBDH, MLS, SML and SMP)

FAWTIR handles Peppol transport for you. Your ERP never speaks AS4. These sources explain what happens after FAWTIR accepts a document.

| Official title | Version | Date | URL | What to use it for |
|---|---|---|---|---|
| Peppol eDelivery documentation (index) | Not stated | Not stated | https://docs.peppol.eu/edelivery/ | Index of all transport specifications, including SBDH, SML and SMP |
| Peppol AS4 Profile | 2.0.3 | Changelog 22 Apr 2024 | https://docs.peppol.eu/edelivery/as4/specification/ | How access points exchange documents (one-way push) |
| Peppol Message Level Status (MLS) | 1.1.0 | 2 Jul 2026 | https://docs.peppol.eu/edelivery/specs/mls/v1.1.0/mls/spec/ | The recipient's status message (`AP`, `AB`, `RE`) behind FAWTIR's delivery states |

The Business Message Envelope (SBDH), SML, SMP, identifier and network policy documents are listed under [Not yet confirmed](#not-yet-confirmed).

## Oman Tax Authority (Fawtara)

| Official title | Version | Date | URL | What to use it for |
|---|---|---|---|---|
| OTA Tax Portal, E-invoicing | Not stated | Page shows "Last updated 07 October 2026" | https://tms.taxoman.gov.om/portal/web/taxportal/e-invoicing | The Tax Authority's description of the five-corner model and the four rollout phases |
| OTA Introduction of E-invoicing | Not stated | Page shows "Last updated 26 July 2026" | https://tms.taxoman.gov.om/portal/introduction-of-envoicing | The same model and phases |
| OTA E-invoicing FAQs | Not stated | Page shows "Last updated 12 November 2026" | https://tms.taxoman.gov.om/portal/e-invoicing-faq | The official go-live dates (FAQ 5) |
| OTA Service Providers FAQs | Not stated | Page shows "Last updated 12 November 2026" | https://tms.taxoman.gov.om/portal/web/taxportal/service-provider-faq | The service provider's role, B2B real-time reporting, QR code status, correction of a wrong buyer |
| OTA Service Providers Criteria | Not stated | Page shows "Last updated 12 November 2026" | https://tms.taxoman.gov.om/portal/web/taxportal/service-provider-criteria | Accreditation criteria for service providers |
| OTA Manual Guides (service providers) | Not stated | Page shows "Last updated 27 September 2026" | https://tms.taxoman.gov.om/portal/web/taxportal/e-invoicing-manual-guide | Index of the Tax Authority's user manuals and its SMP API specification. The page was read; the manuals it links were not. |
| OpenPeppol Peppol Authorities | Not stated | Not stated | https://peppol.org/members/peppol-authorities/ | Lists the Oman Tax Authority (E-invoicing Project, Fawtara) as Oman's Peppol Authority |

**Go-live dates, as the Tax Authority states them (Regulation (OTA), FAQ 5).** E-invoicing applies from 1 April 2027 if supplies from April 2026 to 31 March 2027 exceed OMR 5,000,000, or supplies expected from 1 April 2027 to 31 March 2028 exceed OMR 5,000,000. Otherwise it applies from 1 October 2027. Read the FAQ itself for what counts as a supply.

## Code lists

| Official title | Version | Date | URL | What to use it for |
|---|---|---|---|---|
| PINT OM Billing code lists (Invoice) | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-invoice/codelist/ | Every code list the Oman rules use. Lists you will need: `Aligned-TaxCategoryCodes` (VAT categories S, E, O, Z), `UNCL1001-inv` (invoice type codes), `IssuanceReason` (CL-02-OM credit and debit note reasons), `transactiontype` (CL-03-OM bitmap positions), `ItemType` (G / S), `UNCL4461` (payment means), `UNECERec20` (units), `EAS` (endpoint schemes), and the exemption, zero-rating, service type, ISIC and Oman HS code lists |
| Document name code (Subset: Credit note type code) | 1.0.1 | 29 Jul 2026 | https://docs.peppol.eu/poac/om/pint-om/trn-creditnote/codelist/UNCL1001-cn/ | `UNCL1001-cn`: 81, 83, 381, 396, 532 |
| eDEC Code Lists | 9.7 | 2 Jul 2026 | https://docs.peppol.eu/edelivery/codelists/ | Peppol participant schemes, document types and processes |
| Participant identifier schemes v9.7 | 9.7 (0248 added in 9.6) | 2 Jul 2026 | https://docs.peppol.eu/edelivery/codelists/v9.7/Peppol%20Code%20Lists%20-%20Participant%20identifier%20schemes%20v9.7.html | Scheme `0248`: Oman VAT number, structure `OM` + 10 digits |
| Document types v9.7 | 9.7 (Oman rows added in 9.6) | 2 Jul 2026 | https://docs.peppol.eu/edelivery/codelists/v9.7/Peppol%20Code%20Lists%20-%20Document%20types%20v9.7.html | The exact Oman document type identifiers |
| Processes v9.7 | 9.7 | 2 Jul 2026 | https://docs.peppol.eu/edelivery/codelists/v9.7/Peppol%20Code%20Lists%20-%20Processes%20v9.7.html | Billing, self-billing, tax reporting and MLS process identifiers |

The identifiers FAWTIR writes into Oman documents:

| Document | CustomizationID | ProfileID |
|---|---|---|
| Invoice and credit note | `urn:peppol:pint:billing-1@om-1` | `urn:peppol:bis:billing` |
| Self-billed invoice and credit note | `urn:peppol:pint:selfbilling-1@om-1` | `urn:peppol:bis:selfbilling` |

## Not yet confirmed

The sources below are relevant, but their content was not read for this guide. Do not treat a statement about them in this guide as confirmed.

| Source | Version and date as listed | URL | Why it is here |
|---|---|---|---|
| Peppol Business Message Envelope (SBDH) | 2.0.2, 2 Jul 2026 | https://docs.peppol.eu/edelivery/envelope/Peppol-EDN-Business-Message-Envelope-2.0.2-2026-07-02.pdf | Title, version and date taken from the official eDelivery index. The PDF was not reviewed. |
| Service Provider Operational Guideline on MLS | 1.0.0, 2 Jul 2026 | https://docs.peppol.eu/edelivery/guidelines/mls/SPOG%20on%20MLS%201.0.0%202026-07-02.pdf | Same |
| Peppol Service Metadata Locator (SML) | 1.3.0, 1 Nov 2025 per the eDelivery index (the file name carries 2025-02-06) | https://docs.peppol.eu/edelivery/sml/Peppol-EDN-Service-Metadata-Locator-1.3.0-2025-02-06.pdf | Same |
| Peppol Service Metadata Publishing (SMP) | 1.4.0, 1 Nov 2025 per the eDelivery index (the file name carries 2025-02-06) | https://docs.peppol.eu/edelivery/smp/Peppol-EDN-Service-Metadata-Publishing-1.4.0-2025-02-06.pdf | Same |
| Peppol Policy for use of Identifiers | 4.4.0, 1 Nov 2025 per the eDelivery index (the file name carries 2025-02-06) | https://docs.peppol.eu/edelivery/policies/Peppol-EDN-Policy-for-use-of-identifiers-4.4.0-2025-02-06.pdf | Same |
| Peppol Network Policy | 1.0.0, 2 Jul 2026 | https://docs.peppol.eu/edelivery/policies/Peppol%20Network%20Policy%201.0.0%202026-07-02.pdf | Same |
| Peppol Directory | 1.1.1, 10 Dec 2021 per the eDelivery index (the file name carries 2020-10-15) | https://docs.peppol.eu/edelivery/directory/PEPPOL-EDN-Directory-1.1.1-2020-10-15.pdf | Same |
| PINT OM resources download (schematron, samples) | 1.0.1 | https://docs.peppol.eu/poac/om/pint-om/resources.zip | Link seen on the specification site. The archive was not reviewed for this guide. |
| Fawtara FAQ (PDF) | Not determined | https://tms.taxoman.gov.om/portal/documents/d/taxportal/monthly-faq-s-pdf-1 | The text could not be extracted, so its content is unverified. |
| User manuals linked from the OTA Manual Guides page | Not determined | See the Manual Guides page above | Not opened |
| Fawtara portal | Not determined | https://fawtara.taxoman.gov.om/ | Link seen, not opened |
| OTA data dictionary and business rules | Draft, per the OTA Service Providers FAQ | No official URL found | The Tax Authority describes them as a draft for consultation. |
| QR code specification for Simplified invoices | Pending | No official URL found | The OTA Service Providers FAQ says guidance will be shared. |

Third-party articles also give a pilot start date, a date for the Tax Authority's approval as a Peppol Authority, and a Tax Authority decision number. None of these could be found on an official page, so this guide does not cite them.

## Conflicts and open points in the published specifications

The points below come from reading the published PINT-OM 1.0.1 and TDD pages. They are stated as found, without choosing between the sources. This guide will be updated when the publishers clarify them.

### IBR-079-OM and IBR-174-OM

IBR-079-OM requires an HS code on a goods line "except when Invoice transaction type (BTOM-001) is 'Simplified Tax Invoice'". IBR-174-OM applies the same test without that exemption. Both are flagged fatal, although the IBR-174-OM message says "should". As published, a Simplified invoice line marked as goods without an HS code therefore still fails IBR-174-OM, and the exemption in IBR-079-OM has no practical effect.

Until this is clarified, provide an HS code on every goods line, including on Simplified invoices.

### Decimals on header totals

The sources do not use one precision for all amounts:

- IBR-DEC-03-OM says that "All amount values ... MUST NOT contain more than 3 decimal places", but its context leaves out the document totals and the document-level tax amount.
- The shared rules ibr-091 and ibr-121 to ibr-125 limit the document totals (IBT-107, IBT-108, IBT-109, IBT-110, IBT-112, IBT-115) to 2 decimals.
- The BIS rounding section also lists the document-level allowance and charge amounts (IBT-092, IBT-099) as 2-decimal, while IBR-DEC-03-OM allows 3 decimals on them. No shared 2-decimal rule for IBT-092 or IBT-099 was found.
- The BIS says "Document-level VAT amounts are expressed at two decimals", while IBR-DEC-03-OM allows 3 decimals on the breakdown tax amount (IBT-117).

FAWTIR writes the document totals at 2 decimals and the line and breakdown amounts at 3 decimals, which passes the 1.0.1 rules. See [Decimals and the baisa tolerance](/api/data-mapping/#decimals-and-the-baisa-tolerance).

### Version labels

- The TDD process page and its release notes say version 1.0.1, and OpenPeppol lists "TDD Oman 1.0.1". The TDD BIS page header says v1.0.2.
- The PINT-OM BIS pages show v1.1.3 in their header. That is the version of the general PINT model the Oman specification is built on, not the Oman version, which is 1.0.1.

When you cite these documents, give both labels.
