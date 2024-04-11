const getAllCards = "SELECT * FROM amazonyugioh";
const insertCards =
  "INSERT INTO amazonyugioh(id, name, imagesource, prices, link) VALUES(DEFAULT, $1, $2, $3, $4) RETURNING *";
const deleteOldCards = "DELETE FROM public.amazonyugioh WHERE id > $1";

//userwatchlist table
const getUserWatchList = "SELECT * FROM userwatchlist WHERE email = $1";
const getAllWatchLists = "SELECT * FROM userwatchlist";

module.exports = {
  getAllCards,
  insertCards,
  deleteOldCards,
  getUserWatchList,
  getAllWatchLists,
};
