// // Use browser-version of Nodejs buffer
// const Buffer = require('./vendor/buffer')
//const base32 = require('./vendor/base32')

const Buffer = buffer.Buffer


/**
 * OTP manager class to generate RFC 4226 compliant HMAC-based one-time passwords (HOTPs),
 * and RFC 6238 compliant time-based one-time passwords (TOTPs).
 */
class OTP {
    /**
     * Construct an instance of the OTP generator with a shared secret.
     * @param {string} secret The ascii encoded shared secret used to generate and validate the OTP.
     */
    constructor (secret, encoding='utf8') {
      if (encoding === 'base32') {
        secret = base32.decode(secret);
      }

      this.secret = String(secret)
    }

    /**
     * Generate an HMAC-SHA-1 for the secret and key
     * @param {ArrayBuffer} secret The randomly generated shared secret.
     * @param {ArrayBuffer} counter The counter value. In a TOTP this will be derived from the current time.
     * @returns {Uint8Array} The HMAC hash result.
     *
     * Note - SHA-1 is now considered insecure for some uses, but is still considered secure for the purposes
     * of OTP generation. It is the default hashing algorithm for HOTP (RFC4226) but TOTP (RFC6238), and is
     * the also the only algorithm supported by Google Authenticator.
     * See here for more info - https://github.com/google/google-authenticator-libpam/issues/11
     */
    getHmacDigest(secret, counter) {
      // Initialize SHA-1-HMAC object with encoded secret as key
      let shaObj = new jsSHA("SHA-1", "ARRAYBUFFER")
      shaObj.setHMACKey(secret, "TEXT")

      // Pass the current counter as a message to the HMAC object
      shaObj.update(counter)

      // Retreive and return the result of the the hash in an array
      let hmacResult = new Uint8Array(shaObj.getHMAC("ARRAYBUFFER"))
      return hmacResult
    }

    /**
     * Extract the dynamic binary code from an HMAC-SHA-1 result.
     * @param {Uint8Array} digest The digest should be a 20-byte Uint8Array
     * @returns {number} A 31-bit binary code integer
     */
    getBinaryCode (digest) {
      const offset  = digest[digest.length - 1] & 0xf
      let binaryCode = (
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff))

      return binaryCode
    }

    /**
     * Convert a binary code to a 6 digit OTP value
     * @param {number} number A 31-bit binary code
     * @returns {number} An n-digit string of numbers
     */
    convertToHotp (number, digits = 6) {
      // Convert binary code to an up-to 6 digit number
      let otp = number % Math.pow(10, digits)

      // If the resulting number has fewer than n digits, pad the front with zeros
      return String(otp).padStart(digits, '0')
    }

    /**
     * Calculate a 6-digit HMAC-based one-time password (HOTP), as defined in RFC-4226
     * @param {string} counter A distinct counter value used to generate an OTP with the secret.
     * @returns {string} A six-digit OTP value
     */
    getHOTP (counter) {
      // Calculate an HMAC encoded value from the secret and counter values
      counter = this.encodeCounter(counter)
      const hmacDigest = this.getHmacDigest(this.secret, counter)

      // Extract a dynamically truncated binary code from the HMAC result
      const binaryCode = this.getBinaryCode(hmacDigest)

      // Convert the binary code to a number between 0 and 1,000,000
      const hotp = this.convertToHotp(binaryCode, 6)

      return hotp
    }

    /**
     * Calculate a time-based one-time password (TOTP), as defined in RFC-6238
     * A TOTP is just an HOTP, using a time interval as the counter.
     * @returns {string} A six-digit OTP value
     */
    getTOTP () {
      // Get the current epoch, rounded to intervals of 30 seconds
      let now = Math.floor((new Date()).getTime() / 1000)
      const epoch = Math.floor(now / 30)

      // Calcule an HOTP using the epoch as the counter
      return this.getHOTP(String(epoch))
    }

    /** Static helper to generate random numbers */
    static getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min) + min)
    }

    /**
     * Convert Buffer to ArrayBuffer
     * From https://stackoverflow.com/a/12101012
    */
    toArrayBuffer (buf) {
      let ab = new ArrayBuffer(buf.length);
      let view = new Uint8Array(ab);
      for (let i = 0; i < buf.length; ++i) {
          view[i] = buf[i];
      }
      return ab;
    }

    /** Return base-32 encoded secret. */
    getBase32Secret () {
      return base32.encode(Buffer(secret)).toString().replace(/=/g, '')
    }

    /** Encode the counter values as an 8 byte array buffer. */
    encodeCounter (counter) {
      // Convert the counter value to an 8 byte bufer
      // Adapted from https://github.com/speakeasyjs/speakeasy
      let buf = new Uint8Array(8);
      let tmp = counter;
      for (let i = 0; i < 8; i++) {
          // Mask 0xff over number to get last 8
          buf[7 - i] = tmp & 0xff;

          // Shift 8 and get ready to loop over the next batch of 8
          tmp = tmp >> 8;
      }

      return buf
    }
}

// module.exports = OTP