class Account {
    constructor() {
        this.balance = 100;
        this.maxTransfer = 500;
        this.minBalance = 100;
        this.username = "";
        this._admin = false;
        this.sensitiveData = "";
        this._secret = "confidential";

        // 直接应用属性规则
        this._balance = 100;
        this._maxTransfer = 500;
        this._minBalance = 100;
        this._username = "";
        this._sensitiveData = "";

        Object.defineProperty(this, "balance", {
            get: () => this._balance,
            set: (val) => {
                this._balance = Math.max(0, val);
            },
            enumerable: true,
        });

        Object.defineProperty(this, "maxTransfer", {
            get: () => this._maxTransfer,
            set: (val) => {
                this._maxTransfer = Math.min(1000, val);
            },
            enumerable: true,
        });

        Object.defineProperty(this, "minBalance", {
            get: () => this._minBalance,
            set: (val) => {
                this._minBalance = Math.max(100, val);
            },
            enumerable: true,
        });

        Object.defineProperty(this, "username", {
            get: () => this._username,
            set: (val) => {
                this._username = val.toUpperCase();
            },
            enumerable: true,
        });

        Object.defineProperty(this, "sensitiveData", {
            get: () => this._sensitiveData,
            set: (val) => {
                if (this._admin) this._sensitiveData = val;
            },
            enumerable: true,
        });
    }
}

// 测试用例
const acc = new Account();

// 测试noZero
acc.balance = -50;
console.log(acc.balance); // 0

// 测试noOver
acc.maxTransfer = 1500;
console.log(acc.maxTransfer); // 1000

// 测试noLower
acc.minBalance = 50;
console.log(acc.minBalance); // 100

// 测试watchSet
acc.username = "test";
console.log(acc.username); // 'TEST'

// 测试onlyWhen
acc.sensitiveData = "data";
console.log(acc.sensitiveData); // ''
acc._admin = true;
acc.sensitiveData = "data";
console.log(acc.sensitiveData); // 'data'
