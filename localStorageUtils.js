/**
 * Performs Local Storage operations
*/

// Function to set an item in localStorage
export function setItem(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error('Error setting item to localStorage:', error);
    }
}

// Function to get an item from localStorage
export function getItem(key) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        console.error('Error getting item from localStorage:', error);
        return null;
    }
}

// Function to remove an item from localStorage
export function removeItem(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error('Error removing item from localStorage:', error);
    }
}

// Function to clear all items from localStorage
export function clearStorage() {
    try {
        localStorage.clear();
    } catch (error) {
        console.error('Error clearing localStorage:', error);
    }
}

export async function checkCache() {
    console.log("IN CHECK CACHE")
    try {
        let cacheList = getItem('inventory');
        if(!cacheList) {
            await cacheInventory();
        } else {
            // If 1 day has passed then we will refetch the cache
            let current_date = Date.now();
            let last_updated = cacheList["timestamp"];
            let no_of_days = (current_date - last_updated) / (1000 * 3600 * 24);

            if (no_of_days > 1) {
                await cacheInventory();
                cacheList = getItem('inventory')
            }
        }
        // Return entry by drugcode for faster matching
        return cacheList.data.reduce((map, obj) => {
            map[obj.drugCode] = obj;
            return map;
        }, {});
    } catch (error) {
        console.error("Error while checking cache", error);
        return {}; // Return empty object
    }
}

// Function to fetch inventory(product list) from backend and restore in cache
async function cacheInventory() {
    console.log("IN CACHE")
    try {
        const url = `https://saya.net.in/api/jam2-trade_names/full`;
        const response = await fetch(url);
        const res = await response.json();
        if(res['success']) {
            // set tradenames
            let invData = res["data"].map((item) => {
                if (
                  item.method === "Gel/Cream/Ointment" ||
                  item.method === "drops" ||
                  item.method === "Suspension/Syrup" ||
                  item.method === "powder"
                ) {
                  if (item.trade) {
                    let price = ((parseFloat(item.price) / item.packet_digit) * parseInt(item.trade.packet_digit)).toFixed(2);
                    item.price = price.toString();
                  }
                }
                return item;
              });
  
              // create obj to store in localstorage
              let obj = {
                data: invData,
                timestamp: Date.now(), //store current time
              };

              setItem('inventory', obj);
        } else {
            console.error("Could not fetch product list from the backend");
        }
    } catch (error) {
        console.error("Error while fetching product list") 
    }
} 
