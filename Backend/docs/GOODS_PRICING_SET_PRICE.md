# Goods (Delivery) Pricing ab Set Price se – Admin + Flutter Notes

Pehle goods ka fare **Vehicle Type page** ke fields se banta tha. Ab wo **Pricing → Set Price** se banta hai
(taxi ki tarah, zone-wise). Vehicle Type page par ab sirf vehicle ki details rehti hain.

---

## 1. Admin: price kahan set karein

`/admin/pricing/set-price/create`

1. **Zone** chuno (ya **All Zones** = default price jo har zone par lagta hai jahan zone ka apna price nahi).
2. **Vehicle Type** chuno.
   - Vehicle sirf *Delivery* hai → price apne aap Delivery ka banega.
   - Vehicle *Both* (taxi + goods) hai → **"Pricing for"** dikhega: **Delivery (goods)** chuno.
     (Goods ka fare sirf *Delivery* wale price se banta hai. Taxi ke liye alag *Taxi rides* price banta hai.)
3. Fields: Payment type, Admin commission (driver/owner), **Service Tax**, **Base Price**, **Base Distance**,
   **Price / Distance**, aur Cancellation fee. (Delivery ke liye time/waiting/airport/outstation fields nahi dikhte.)
4. Save.

**Goods fare** = `Base Price + (distance − Base Distance) × Price/Distance`, phir **Service Tax**.
Vehicle ke **load height** aur **extras** ka charge uske upar jodta hai (wo Vehicle Type page par hi set hote hain).

### Kaun sa price lagta hai (sabse specific pehle)
1. Pickup wale **zone** ka Delivery price
2. Pickup ki **service location** ka price
3. **All Zones** ka Delivery price
4. Koi bhi Delivery Set Price nahi → vehicle ke **purane** values (fallback, neeche dekho)

Dhyan:
- Dusre zone ka price kabhi nahi lagta (All Zones row hi default hai).
- *Taxi* ya *Both (shared)* wale rows goods ke liye **kabhi use nahi hote**, taki taxi ka rate galti se goods par na lage.
- Agar Delivery price me Base Price aur Price/Distance dono 0 hon to wo "unpriced" maana jaata hai (form isse save hone se rokta hai).

---

## 2. Vehicle Type page par kya badla

`/admin/pricing/vehicle-type/create` (aur edit)

- **Hata diya:** Delivery Distance Based Charges (base price, base distance, distance price), Service Tax, Admin Commission fields.
  Unki jagah **"Goods Pricing"** panel hai jisme Set Price ka link hai.
- **Wahin hai:** transport/icon, capacity, load capacity, **load height & extras**, ETA/sequence, Headline Rate (₹/km, sirf card par dikhne wala text), delivery category.
- Purane price values delete nahi hote; edit page par amber note dikhta hai ("older prices... used until a Delivery Set Price exists").

---

## 3. Purane vehicles ko migrate karna (ek baar)

Purane vehicle prices ko Set Price rows me copy karne ke liye (fare/commission/payment methods wahi rehte hain):

```bash
cd Backend
node scripts/migrateDeliveryPricingToSetPrice.js            # dry run: sirf plan dikhata hai
node scripts/migrateDeliveryPricingToSetPrice.js --apply    # rows banata hai + undo list file likhta hai
```
- Har goods vehicle ke liye ek **All Zones – Delivery** Set Price banata hai (jo already hai use skip karta hai; dobara chalana safe hai).
- Agar vehicle ka pehle se *Both* Set Price hai to uska payment/commission/cancellation fee copy hota hai, taaki sirf fare ka source badle.
- Kuch delete ya modify nahi hota.

---

## 4. Flutter / apps ke liye

Fare ka **sach sirf quote API** hai: `POST /deliveries/quote` (`vehicleTypeId`, `pickup:[lng,lat]`, `drop:[lng,lat]`).
Response me naye fields:

| Field | Matlab |
|---|---|
| `pricingSource` | `set_price` (Set Price se) ya `vehicle` (purane values, jab tak Delivery Set Price nahi bana) |
| `setPriceId` | kaun si Set Price row lagi (ya `null`) |
| `priced` | `false` ho to us vehicle ka fare set nahi hai |

- Booking (`POST /deliveries`) usi quote jaisa fare charge karti hai (same resolver).
- **Zone-wise price** quote me pickup se nikalta hai, isliye fare dikhane ke liye hamesha quote API use karo.
- `GET /users/vehicle-types` (catalog) ab goods vehicles ke `delivery_distance_pricing` me **All Zones** Set Price ka rate dikhata hai
  (+ `delivery_pricing_source`). Zone-specific rate catalog me nahi aata, wo sirf quote se milta hai.
  Catalog me kisi ko "from ₹X" jaisa dikhana ho to theek hai, par final fare ke liye quote.
- Set Price change hone par catalog cache apne aap reset hota hai.

User web app (`SenderReceiverDetails`) ab fare quote API se leta hai; quote na mile (jaise user logged-in nahi) to purana local estimate fallback hai.

---

## 5. QA checklist

- [ ] Naya Delivery Set Price banao (All Zones) → quote `pricingSource: set_price`, total sahi.
- [ ] Zone wala Set Price banao → us zone ke pickup par wahi lagta hai, bahar All Zones wala.
- [ ] Set Price edit karo → agla quote turant naya.
- [ ] Both vehicle par "Pricing for: Delivery" chuno → taxi-only fields chhup jaate hain.
- [ ] Both vehicle ka Taxi/Both row goods fare ko nahi badalta.
- [ ] Delivery Set Price na ho → purane vehicle values se fare (pricingSource `vehicle`).
- [ ] Booking ka fare == quote.
- [ ] Vehicle Type page save karo → price/legacy values aur load height/extras safe.
- [ ] Migration dry-run plan sahi, `--apply` ke baad fare same, dobara chalane par sab skip.
