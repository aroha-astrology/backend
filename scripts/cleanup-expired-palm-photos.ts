/** Deletes expired palm_photos rows (uploaded but never consumed within the 48h retention window). Usage: npx tsx scripts/cleanup-expired-palm-photos.ts */
import { deleteExpiredPalmPhotos } from '../src/modules/palm/palm-photo.repo.js';

async function main() {
  const deleted = await deleteExpiredPalmPhotos();
  console.log(`Deleted ${deleted} expired palm photo(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
