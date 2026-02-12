# Consent Order Subset (1999-present)

- Total matching records: 13
- Records with PDF URL: 12
- `site_remediation_program`: 11
- `remediation_standards_reference`: 2
- `cercla_reference`: 0

## Criteria
- Consent orders only (`consent` in enforcement-action field).
- Included if one or more of:
  - Program includes `Site Remediation`.
  - Text references remediation standards regulations (`RSR`, `22a-133k`, or phrase match).
  - Text references `CERCLA`.

## Notes
- This uses metadata fields from CT Open Data datasets `tvbr-6b6t` and `t2bf-45ba`.
- `cercla_reference` count can be zero even when a linked PDF mentions CERCLA in full text.
