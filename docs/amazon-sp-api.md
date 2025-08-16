# Amazon Sellers Partner API

## LWA Access Token

### API 

const axios \= require('axios');  
const qs \= require('qs');  
let data \= qs.stringify({  
  'client\_id': 'amzn1.application-oa2-client.24f67bc6eb8043d4984e840a1a22b593',  
  'client\_secret': 'amzn1.oa2-cs.v1.7af80ef9fcb4698a2d1fedb545a4f68cd62d78110d4493bb64d665c0442ffdf6',  
  'refresh\_token': 'Atzr|IwEBIDoZskx4Zxylfme0D9XqkGiPBLJEd5KyHuRpiMM\_XNu7aoGf1b64ND-nfO7CofWKkOuc4jpODrG27wJ-ECBRERtutlNpE71Qj5xuC2\_\_twEt5WtKz-XZGPCVJlInU1-vbjwUKIqQu2TSCufHu4RVoiTJQ2Czmo71Ws19xzYIMeNNmhPVhOqhDTbYBCWElefcIky2bRTsCQJJeqbsowxeyaNCDt2Tag0XdO9pZdTxirLJkt6RWnh9kkDV2pYjG1-y9KVMqdM\_5M2jyMaZ5rxcfmso3NMM4LFTZMbExZ4R6aEG2KEXFUitEDxuq7RIqYo-hFA',  
  'grant\_type': 'refresh\_token'   
});

let config \= {  
  method: 'post',  
  maxBodyLength: Infinity,  
  url: 'https://api.amazon.com/auth/o2/token',  
  headers: {   
    'Content-Type': 'application/x-www-form-urlencoded',   
    'Cookie': 'session-id=146-7425287-7665204; session-id-time=2385394524l; session-token=g9OHwQ612WZg3e5xjXHGjAv16Ej43gdDcFPbn84EMX8VupIfZQpz5WwbvAzFOziUoAoxcD2zoJTt6yST5W3j4ikBPyiXrAYzEVGGo/U9AYrA0zbOZPFZtEsV1bipIoRq8VeKSF1XUGazKffTCQwvYXtypnFRM/R1qQXj23xsHNQ6ydqpEYQFGv7QYxjIVpfLXB+gRU3oZiqmDRZBbRHyLOvxcpAnnEKc74ykdWV4fbadfVGb3ipb8zxC+p6+zw3xLh3S4NO9MTVjTBA1rORh+OQELE3tNUKY8mx0nvugVwOdmwZzC1wUA9fXGjq93rEzAb47UwT2dEvqxISnlYBkPylGGXujMsjS; ubid-main=130-4252264-2936523'  
  },  
  data : data  
};

axios.request(config)  
.then((response) \=\> {  
  console.log(JSON.stringify(response.data));  
})  
.catch((error) \=\> {  
  console.log(error);  
});

### Response

{  
    "access\_token": "Atza|IwEBIBFBtfvahxmTXKTLh05YeU7v7XlCE6UdAKSrIEpHE0Ua\_u8TcMwZnYaATh9REIxmU6KbNdbV28doCZmz0AG9fbljA27JYVgGVyZGdgF\_mWPEB2KvERsDiBgNUmjFV4EduRaVh\_rA2DWyiCs1YzQHVHrfEtk49ZBIvyYI5e9vCs6j-njDN4xqeCaNIw69YyX2Kp0wzlJXLSV7-lBY-vB0QJCeVnvdwo7w8KfYCoCTYL\_lmpVPDzZnecJelR2itN1y-yFflLiOSpQ3P2vHuSQoI2SKUbcOOfz7y0uNQiyvuqM3JUVSiFOiQBmQ4zgxAkSBAEdZK4puNbbOsT7rhe4MDFdVKG2-adupRNCFotzh2KACbA",  
    "refresh\_token": "Atzr|IwEBIDoZskx4Zxylfme0D9XqkGiPBLJEd5KyHuRpiMM\_XNu7aoGf1b64ND-nfO7CofWKkOuc4jpODrG27wJ-ECBRERtutlNpE71Qj5xuC2\_\_twEt5WtKz-XZGPCVJlInU1-vbjwUKIqQu2TSCufHu4RVoiTJQ2Czmo71Ws19xzYIMeNNmhPVhOqhDTbYBCWElefcIky2bRTsCQJJeqbsowxeyaNCDt2Tag0XdO9pZdTxirLJkt6RWnh9kkDV2pYjG1-y9KVMqdM\_5M2jyMaZ5rxcfmso3NMM4LFTZMbExZ4R6aEG2KEXFUitEDxuq7RIqYo-hFA",  
    "token\_type": "bearer",  
    "expires\_in": 3600  
}

## Create Report

### API

const axios \= require('axios');  
let data \= JSON.stringify({  
  "marketplaceIds": \[  
    "ATVPDKIKX0DER"  
  \],  
  "reportType": "GET\_FLAT\_FILE\_RETURNS\_DATA\_BY\_RETURN\_DATE",  
  "dataStartTime": "2025-06-15T00:00:00Z",  
  "dataEndTime": "2025-07-15T00:00:00Z"  
});

let config \= {  
  method: 'post',  
  maxBodyLength: Infinity,  
  url: 'https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports',  
  headers: {   
    'Content-Type': 'application/json',   
    'x-amz-access-token': 'Atza|IwEBIAIMYfSE1T\_KOHHYIn8YDuT1B01X3a3o90Z30qKxDApbCu35OJWZPDzSQ3zw8x5jMwkRCNAw0Y2FEbffnHd7nl6gDmvbK5Rf0I65jk4RtLeIYDNHnYD2pp5-htvnWH7FM\_Ss8Sny5bnhVXdGyx2wdca5PcnineAOEwNAraHYv0kiaqUpumszqGQDqWc9zK0Dlh9tHNJl8p2BAAqbwE4esFR8T-4wDbbZhaV9rpBhelHJUzhPdMCgE8PVat7CIQITXFhPkaBGhy4TB1lswGTI2eIAvjqHNhx\_NgInS\_tMj4lUdggn\_VMgMJ-QSgfo4LCd7jsA-KNiCtKBaTmKDHTNuOrpZdTdI1eFjsPDWnlQbFG21A',   
    'Cookie': 'session-id=146-7425287-7665204; session-id-time=2385394524l; session-token=g9OHwQ612WZg3e5xjXHGjAv16Ej43gdDcFPbn84EMX8VupIfZQpz5WwbvAzFOziUoAoxcD2zoJTt6yST5W3j4ikBPyiXrAYzEVGGo/U9AYrA0zbOZPFZtEsV1bipIoRq8VeKSF1XUGazKffTCQwvYXtypnFRM/R1qQXj23xsHNQ6ydqpEYQFGv7QYxjIVpfLXB+gRU3oZiqmDRZBbRHyLOvxcpAnnEKc74ykdWV4fbadfVGb3ipb8zxC+p6+zw3xLh3S4NO9MTVjTBA1rORh+OQELE3tNUKY8mx0nvugVwOdmwZzC1wUA9fXGjq93rEzAb47UwT2dEvqxISnlYBkPylGGXujMsjS; ubid-main=130-4252264-2936523'  
  },  
  data : data  
};

axios.request(config)  
.then((response) \=\> {  
  console.log(JSON.stringify(response.data));  
})  
.catch((error) \=\> {  
  console.log(error);  
});

### Response

{  
    "reportId": "326246020314"  
}

## Get Report

### API

const axios \= require('axios');

let config \= {  
  method: 'get',  
  maxBodyLength: Infinity,  
  url: 'https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/326194020313',  
  headers: {   
    'x-amz-access-token': 'Atza|IwEBIAIMYfSE1T\_KOHHYIn8YDuT1B01X3a3o90Z30qKxDApbCu35OJWZPDzSQ3zw8x5jMwkRCNAw0Y2FEbffnHd7nl6gDmvbK5Rf0I65jk4RtLeIYDNHnYD2pp5-htvnWH7FM\_Ss8Sny5bnhVXdGyx2wdca5PcnineAOEwNAraHYv0kiaqUpumszqGQDqWc9zK0Dlh9tHNJl8p2BAAqbwE4esFR8T-4wDbbZhaV9rpBhelHJUzhPdMCgE8PVat7CIQITXFhPkaBGhy4TB1lswGTI2eIAvjqHNhx\_NgInS\_tMj4lUdggn\_VMgMJ-QSgfo4LCd7jsA-KNiCtKBaTmKDHTNuOrpZdTdI1eFjsPDWnlQbFG21A',   
    'Cookie': 'session-id=146-7425287-7665204; session-id-time=2385394524l; session-token=g9OHwQ612WZg3e5xjXHGjAv16Ej43gdDcFPbn84EMX8VupIfZQpz5WwbvAzFOziUoAoxcD2zoJTt6yST5W3j4ikBPyiXrAYzEVGGo/U9AYrA0zbOZPFZtEsV1bipIoRq8VeKSF1XUGazKffTCQwvYXtypnFRM/R1qQXj23xsHNQ6ydqpEYQFGv7QYxjIVpfLXB+gRU3oZiqmDRZBbRHyLOvxcpAnnEKc74ykdWV4fbadfVGb3ipb8zxC+p6+zw3xLh3S4NO9MTVjTBA1rORh+OQELE3tNUKY8mx0nvugVwOdmwZzC1wUA9fXGjq93rEzAb47UwT2dEvqxISnlYBkPylGGXujMsjS; ubid-main=130-4252264-2936523'  
  }  
};

axios.request(config)  
.then((response) \=\> {  
  console.log(JSON.stringify(response.data));  
})  
.catch((error) \=\> {  
  console.log(error);  
});

### Response

{  
    "reportType": "GET\_FLAT\_FILE\_RETURNS\_DATA\_BY\_RETURN\_DATE",  
    "processingEndTime": "2025-08-13T17:26:00+00:00",  
    "processingStatus": "DONE",  
    "marketplaceIds": \[  
        "ATVPDKIKX0DER"  
    \],  
    "reportDocumentId": "amzn1.spdoc.1.4.na.01cbec39-0303-4e69-8364-22659f4ef643.T32WGTBPCEWUIA.401",  
    "reportId": "326194020313",  
    "dataEndTime": "2025-07-15T00:00:00+00:00",  
    "createdTime": "2025-08-13T17:25:45+00:00",  
    "processingStartTime": "2025-08-13T17:25:52+00:00",  
    "dataStartTime": "2025-06-15T00:00:00+00:00"  
}

## Get Report Document

### API

const axios \= require('axios');

let config \= {  
  method: 'get',  
  maxBodyLength: Infinity,  
  url: 'https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/amzn1.spdoc.1.4.na.01cbec39-0303-4e69-8364-22659f4ef643.T32WGTBPCEWUIA.401',  
  headers: {   
    'x-amz-access-token': 'Atza|IwEBIC069209el5fZ7d3vUvxAr0sg6YwgvwNEiOnunZsO\_6gAdLfHKC7Tsbca\_bquwd\_5abe4JC7ALrm6ocm5CeYUR6jmnWJnRE\_0QX6IJ\_yt8crs-ZM9Nn-AJJlpPc8P6e3faI04j-kuxoKbX7mEichCFei8lzk2\_GN4zWIs\_eiLmprWn-3wOag6KrZmzqXwtco5kfBtMNYta9U-6cdPeQKrpLuh1ovQWAUPeIfX1YGBbJFHWRn0rqLLn4O05OJx1p-USBTaroYS09BogkOzQPLAQtr776pB0aH87jhPKLjikIILbkruhw1RI8jtT-na-YRC5Tn1zh6B3bb04GBycyVSHy8',   
    'Cookie': 'session-id=146-7425287-7665204; session-id-time=2385394524l; session-token=g9OHwQ612WZg3e5xjXHGjAv16Ej43gdDcFPbn84EMX8VupIfZQpz5WwbvAzFOziUoAoxcD2zoJTt6yST5W3j4ikBPyiXrAYzEVGGo/U9AYrA0zbOZPFZtEsV1bipIoRq8VeKSF1XUGazKffTCQwvYXtypnFRM/R1qQXj23xsHNQ6ydqpEYQFGv7QYxjIVpfLXB+gRU3oZiqmDRZBbRHyLOvxcpAnnEKc74ykdWV4fbadfVGb3ipb8zxC+p6+zw3xLh3S4NO9MTVjTBA1rORh+OQELE3tNUKY8mx0nvugVwOdmwZzC1wUA9fXGjq93rEzAb47UwT2dEvqxISnlYBkPylGGXujMsjS; ubid-main=130-4252264-2936523'  
  }  
};

axios.request(config)  
.then((response) \=\> {  
  console.log(JSON.stringify(response.data));  
})  
.catch((error) \=\> {  
  console.log(error);  
});

### Response

{  
    "reportDocumentId": "amzn1.spdoc.1.4.na.01cbec39-0303-4e69-8364-22659f4ef643.T32WGTBPCEWUIA.401",  
    "url": "https://tortuga-prod-na.s3-external-1.amazonaws.com/01cbec39-0303-4e69-8364-22659f4ef643.amzn1.tortuga.4.na.T32WGTBPCEWUIA?response-content-encoding=identity\&X-Amz-Algorithm=AWS4-HMAC-SHA256\&X-Amz-Date=20250814T041716Z\&X-Amz-SignedHeaders=host\&X-Amz-Expires=300\&X-Amz-Credential=AKIA5U6MO6RAH4QMMI5J%2F20250814%2Fus-east-1%2Fs3%2Faws4\_request\&X-Amz-Signature=b5f933a644d8397969c10771ecab9c289c29eccaac33475d3dc669fb0a878c22"  
}

### Document

Order ID	Order date	Return request date	Return request status	Amazon RMA ID	Merchant RMA ID	Label type	Label cost	Currency code	Return carrier	Tracking ID	Label to be paid by	A-to-Z Claim	Is prime	ASIN	Merchant SKU	Item Name	Return quantity	Return Reason	In policy	Return type	Resolution	Invoice number	Return delivery date	Order Amount	Order quantity	SafeT Action reason	SafeT claim id	SafeT claim state	SafeT claim creation time	SafeT claim reimbursement amount	Refunded Amount  
113-6277818-6289068	10-Jul-2025	14-Jul-2025	Approved	DfqRyqfBRRMA	 	AmazonPrePaidLabel	4.14	USD	USPS	9202090339598363834190	Seller	N	N	B0DFN2HN9N	PANEC-925SS-IT	Privosa Fine Jewelry Necklace for Women \- 925 Sterling Silver Necklace for Men \- Unisex 16 to 18 Inch Adjustable Chain \- Italian Made with Spring Ring	2	AMZ-PG-WJ-TOO-SMALL	Y	C-Returns	StandardRefund	 	 	21.38	2	

## Get Orders

### API

const axios \= require('axios');

let config \= {  
  method: 'get',  
  maxBodyLength: Infinity,  
  url: 'https://sellingpartnerapi-na.amazon.com/orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER\&CreatedAfter=2025-07-16',  
  headers: {   
    'x-amz-access-token': 'Atza|IwEBIC069209el5fZ7d3vUvxAr0sg6YwgvwNEiOnunZsO\_6gAdLfHKC7Tsbca\_bquwd\_5abe4JC7ALrm6ocm5CeYUR6jmnWJnRE\_0QX6IJ\_yt8crs-ZM9Nn-AJJlpPc8P6e3faI04j-kuxoKbX7mEichCFei8lzk2\_GN4zWIs\_eiLmprWn-3wOag6KrZmzqXwtco5kfBtMNYta9U-6cdPeQKrpLuh1ovQWAUPeIfX1YGBbJFHWRn0rqLLn4O05OJx1p-USBTaroYS09BogkOzQPLAQtr776pB0aH87jhPKLjikIILbkruhw1RI8jtT-na-YRC5Tn1zh6B3bb04GBycyVSHy8',   
    'Cookie': 'session-id=146-7425287-7665204; session-id-time=2385394524l; session-token=g9OHwQ612WZg3e5xjXHGjAv16Ej43gdDcFPbn84EMX8VupIfZQpz5WwbvAzFOziUoAoxcD2zoJTt6yST5W3j4ikBPyiXrAYzEVGGo/U9AYrA0zbOZPFZtEsV1bipIoRq8VeKSF1XUGazKffTCQwvYXtypnFRM/R1qQXj23xsHNQ6ydqpEYQFGv7QYxjIVpfLXB+gRU3oZiqmDRZBbRHyLOvxcpAnnEKc74ykdWV4fbadfVGb3ipb8zxC+p6+zw3xLh3S4NO9MTVjTBA1rORh+OQELE3tNUKY8mx0nvugVwOdmwZzC1wUA9fXGjq93rEzAb47UwT2dEvqxISnlYBkPylGGXujMsjS; ubid-main=130-4252264-2936523'  
  }  
};

axios.request(config)  
.then((response) \=\> {  
  console.log(JSON.stringify(response.data));  
})  
.catch((error) \=\> {  
  console.log(error);  
});

### Truncated Response (Start)

{  
    "payload": {  
        "Orders": \[  
            {  
                "BuyerInfo": {},  
                "AmazonOrderId": "111-5863063-0970621",  
                "EarliestShipDate": "2025-07-16T06:59:59Z",  
                "SalesChannel": "Amazon.com",  
                "OrderStatus": "Shipped",  
                "NumberOfItemsShipped": 1,  
                "OrderType": "StandardOrder",  
                "IsPremiumOrder": false,  
                "IsPrime": false,  
                "FulfillmentChannel": "AFN",  
                "NumberOfItemsUnshipped": 0,  
                "HasRegulatedItems": false,  
                "IsReplacementOrder": "false",  
                "IsSoldByAB": false,  
                "LatestShipDate": "2025-07-16T06:59:59Z",  
                "ShipServiceLevel": "Standard",  
                "IsISPU": false,  
                "MarketplaceId": "ATVPDKIKX0DER",  
                "PurchaseDate": "2025-07-16T00:11:23Z",  
                "ShippingAddress": {  
                    "StateOrRegion": "CT",  
                    "PostalCode": "06062-2139",  
                    "City": "PLAINVILLE",  
                    "CountryCode": "US"  
                },  
                "IsAccessPointOrder": false,  
                "SellerOrderId": "111-5863063-0970621",  
                "PaymentMethod": "Other",  
                "IsBusinessOrder": false,  
                "OrderTotal": {  
                    "CurrencyCode": "USD",  
                    "Amount": "305.20"  
                },  
                "PaymentMethodDetails": \[  
                    "Standard"  
                \],  
                "IsGlobalExpressEnabled": false,  
                "LastUpdateDate": "2025-07-17T11:41:30Z",  
                "ShipmentServiceLevelCategory": "Standard"  
            },

### Truncated response (End)

        "NextToken": "XC3Yzh3HEF+aJqJYLDm0ZAmQazDrhw3CaH7KtZ7DI49UojdU4H46tsNI3HOI22PIxqXyQLkGMBs8VhF73Xgy+2Sl0PZh3HgHxgoQvh+zICmNdVRYqZlYDf3Ad5ftA4qZInTAy+XKVmRZBY+oaVuyczX3Rf0lDssmYZvnJgaBZNgYV/aE8hgqxiAdmtJpmSMJf2GLmUGyr9UGnxD0RJmrryegoU0IPZxXLGRXH95Of/TgfpNlVdxF9/E6/L3hC3n9MBO/reDY2s8hGWNNu3VwFU0hrIUQcumU7YYXwRo+g8JZuOJFtyFGVNuZ3sLNMwtcXtpzeaBzQ+Y4ZL3wDs4dI8OdZ5xP9ySdkIoA5IWbr/0AUrdbi+HQJDNmBqOZP6s5J89ZPI+feteBA1KyEG2j/Km8ERy2ZulULg8X5XV+0dCcZOj2DZcd5A==",  
        "CreatedBefore": "2025-08-14T04:18:21Z"  
    }  
}

## Get Solicitation Actions For Order

### API

const axios \= require('axios');

let config \= {  
  method: 'get',  
  maxBodyLength: Infinity,  
  url: 'https://sellingpartnerapi-na.amazon.com/solicitations/v1/orders/114-0354496-8501043?marketplaceIds=ATVPDKIKX0DER',  
  headers: {   
    'x-amz-access-token': 'Atza|IwEBIAFbFuu0W9NVhvKgJEVB59HJviuAw-wdVu0GaN3NCIogcOhUEgDRebyRl3SE2S19ude\_bi4fRP9crK60DzwqXIKB3wWZ7uWosNnHNlMTMg3GbHfNOHSZOHJovawhsQ4ElIc\_pERaBLgAm8hW9AfuRg0PI7uDNknmuIfrmAmpQOhDfao6KKS1XgWbRoXwplg1CxYH9b1-gMDZlvobvbbVx-\_ZXqYREZLHZGf870kLSVbMLYDV4EzlRcLG9urbz9\_sMyUQDXjoZL2oZqSziDF4KaKWry\_snKVjWpFKZCkw0JqRknrOxo3MUV72BzaB15Uqx8Pm4sfdCmv5FNBtCKQsvDe6av79lV9a-xHCMVRp2tEp8w',   
    'Cookie': 'session-id=146-7425287-7665204; session-id-time=2385394524l; session-token=g9OHwQ612WZg3e5xjXHGjAv16Ej43gdDcFPbn84EMX8VupIfZQpz5WwbvAzFOziUoAoxcD2zoJTt6yST5W3j4ikBPyiXrAYzEVGGo/U9AYrA0zbOZPFZtEsV1bipIoRq8VeKSF1XUGazKffTCQwvYXtypnFRM/R1qQXj23xsHNQ6ydqpEYQFGv7QYxjIVpfLXB+gRU3oZiqmDRZBbRHyLOvxcpAnnEKc74ykdWV4fbadfVGb3ipb8zxC+p6+zw3xLh3S4NO9MTVjTBA1rORh+OQELE3tNUKY8mx0nvugVwOdmwZzC1wUA9fXGjq93rEzAb47UwT2dEvqxISnlYBkPylGGXujMsjS; ubid-main=130-4252264-2936523'  
  }  
};

axios.request(config)  
.then((response) \=\> {  
  console.log(JSON.stringify(response.data));  
})  
.catch((error) \=\> {  
  console.log(error);  
});

### Response

{  
    "\_links": {  
        "actions": \[\],  
        "self": {  
            "href": "/solicitations/v1/orders/114-0354496-8501043?marketplaceIds=ATVPDKIKX0DER"  
        }  
    },  
    "\_embedded": {  
        "actions": \[\]  
    }  
}

### Note

If it has value in "actions": \[\] then it is eligible for Solicitation 

## create Product Review And Seller Feedback Solicitation

### API

const axios \= require('axios');

let config \= {  
  method: 'post',  
  maxBodyLength: Infinity,  
  url: 'https://sellingpartnerapi-na.amazon.com/solicitations/v1/orders/112-6378781-5009833/solicitations/productReviewAndSellerFeedback?marketplaceIds=ATVPDKIKX0DER',  
  headers: {   
    'x-amz-access-token': 'Atza|IwEBIMIMXaLvf40Dc4pmVj6PhhGaArPyTT1HkDYThgkuubScrKuM1cVoJ3DcZIixChyawty5F\_2WvpwMP-Y9WjnXoM4LxRFqtKhMrZK1n-vkWv0rUV2nrlo\_lQ80ZJJoaPn4IduYN8ST\_MtL9uzBblGEApOJMBvSE\_n8UxOgpCsWHWHG2D-1VcavPkYZA4TlZAR4UXLL4pqgO0zXwXkH1b0dpVQFwFbG1ksTeuht4mjFkzvKo3LClOj34G1-bkw2Cwpe7UQ2dUmLX3pLoB4sEAUKMtrLp7-pQq-7c-Gv3I-MdcKmuvroxD6pfQF40MgoRKeSgjJXE1ob8Q6UQfP-1Cz9DKryqKYtAh8izTx3-93M93NJdQ',   
    'Cookie': 'session-id=146-7425287-7665204; session-id-time=2385394524l; session-token=g9OHwQ612WZg3e5xjXHGjAv16Ej43gdDcFPbn84EMX8VupIfZQpz5WwbvAzFOziUoAoxcD2zoJTt6yST5W3j4ikBPyiXrAYzEVGGo/U9AYrA0zbOZPFZtEsV1bipIoRq8VeKSF1XUGazKffTCQwvYXtypnFRM/R1qQXj23xsHNQ6ydqpEYQFGv7QYxjIVpfLXB+gRU3oZiqmDRZBbRHyLOvxcpAnnEKc74ykdWV4fbadfVGb3ipb8zxC+p6+zw3xLh3S4NO9MTVjTBA1rORh+OQELE3tNUKY8mx0nvugVwOdmwZzC1wUA9fXGjq93rEzAb47UwT2dEvqxISnlYBkPylGGXujMsjS; ubid-main=130-4252264-2936523'  
  }  
};

axios.request(config)  
.then((response) \=\> {  
  console.log(JSON.stringify(response.data));  
})  
.catch((error) \=\> {  
  console.log(error);  
});

			