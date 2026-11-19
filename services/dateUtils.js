/**
 * Indian Standard Time (IST, Asia/Kolkata) Date & Time Utilities
 * 
 * Guarantees consistent date and time calculations across all environments,
 * specifically handling the UTC midnight rollover difference on cloud hosts (e.g. Render).
 * India is UTC +05:30. Between 00:00:00 and 05:29:59 IST, the UTC host date is the previous calendar day.
 * These utilities enforce Asia/Kolkata timezone calculations everywhere.
 */

/**
 * Returns canonical business date string: "DD-MM-YYYY" in Asia/Kolkata.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Formatted as "DD-MM-YYYY" (e.g. "19-11-2026")
 */
function getIstDate(date = new Date()) {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).replace(/\//g, '-');
}

/**
 * Returns formatted time string in Asia/Kolkata (e.g. "06:30 pm").
 * @param {Date|string|number} [date=new Date()]
 * @returns {string}
 */
function getIstTime(date = new Date()) {
    const d = new Date(date);
    return d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Returns formatted display date for EJS templates (e.g. "19/11/2026") in Asia/Kolkata.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string}
 */
function getIstDisplayDate(date = new Date()) {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

module.exports = {
    getIstDate,
    getIstTime,
    getIstDisplayDate
};
