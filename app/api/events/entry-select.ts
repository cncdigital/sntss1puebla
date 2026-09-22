export const EVENT_ENTRY_SELECT = `SELECT * FROM (
  SELECT entry.id,
    ROW_NUMBER() OVER (
      PARTITION BY entry.event_id
      ORDER BY entry.id
    ) AS eventSequence,
    entry.event_id AS eventId,
    entry.credential_token AS credentialToken,
    entry.full_name AS fullName,
    entry.matricula,
    entry.category,
    entry.curp,
    entry.rfc,
    entry.nss,
    entry.companion,
    entry.companion_gender AS companionGender,
    entry.raffle_token AS raffleToken,
    entry.reader_actor AS readerActor,
    entry.created_at AS createdAt
  FROM event_entries entry
) numbered_entries`;
