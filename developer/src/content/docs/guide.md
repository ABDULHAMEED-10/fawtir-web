---
title: "Overview"
description: "This guide is for developers who connect an existing ERP, accounting or POS system to FAWTIR."
sidebar:
  label: "Overview"
  order: 0
banner:
  content: "Draft. This guide is under review and may change before Fawtir publishes it."
---
This guide is for developers who connect an existing ERP, accounting or POS system to FAWTIR. It
explains how to send invoices, credit notes and debit notes, how FAWTIR turns them into PINT-OM
e-invoices delivered over Peppol, and how your system learns the outcome.

If you are new to Peppol, start with the [Introduction](/get-started/introduction/). If you want to send
a test invoice, go to the [Quick start](/get-started/quick-start/).

## Contents

| Section | What it covers |
| --- | --- |
| [Introduction](/get-started/introduction/) | What FAWTIR does, the three integration channels, and the architecture |
| [Quick start](/get-started/quick-start/) | From onboarding to your first test invoice |
| [Environments](/get-started/environments/) | TEST and production, base URLs and API versions |
| [Authentication](/get-started/authentication/) | API keys, OAuth clients, permissions and authentication errors |
| [API reference](/api/reference/) | Every endpoint an integration uses, with examples |
| [ERP data mapping](/api/data-mapping/) | How your ERP fields map to PINT-OM, and the rules FAWTIR enforces |
| [Invoice synchronization](/integrate/synchronization/) | Push, pull, retries, duplicates and reconciliation |
| [ERP connector](/integrate/managed-pull/) | Managed Pull: letting FAWTIR collect invoices from your ERP |
| [Invoice lifecycle](/integrate/lifecycle/) | Statuses, Peppol delivery, recipient responses and tax data reporting |
| [Error reference](/reference/errors/) | Every error code, what it means and what to do |
| [Invoice corrections](/integrate/corrections/) | Credit notes, debit notes and fixing rejected documents |
| [Webhooks](/integrate/webhooks/) | Optional event notifications, and polling |
| [Platform limits](/reference/limits/) | Sizes, rate limits, precision, dates and numbering |
| [TEST checklist](/go-live/test-checklist/) | Scenarios to pass before you go live |
| [Production go-live](/go-live/production/) | Moving from TEST to production safely |
| [Support and versioning](/go-live/support/) | API versions, changes and how to get help |
| [Official references](/reference/official-references/) | PINT-OM, Peppol and Oman Tax Authority sources |
| [FAQ and glossary](/reference/faq/) | Common questions and the terms used in this guide |

## How to read the rules in this guide

Rules in this guide come from four places. We label them so you know where each rule comes from:

- <span class="rule rule--ota">Regulation (OTA)</span> a requirement of the Oman Tax Authority.
- <span class="rule rule--pint">PINT-OM rule</span> a rule of the PINT-OM specification. These carry a rule ID such as `IBR-079-OM`.
- <span class="rule rule--fawtir">FAWTIR rule</span> how the FAWTIR platform behaves.
- <span class="rule rule--advice">Recommendation</span> our advice for building a reliable integration.

All company names, tax numbers, invoice numbers and credentials in the examples are fictitious.
