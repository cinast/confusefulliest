import { propRules } from "./propRules";

// 启用实验性装饰器
declare const decorators: any;

class Account {
    @(propRules.noZero as any)
    balance: number = 100;

    @(propRules.noOver(1000) as any)
    maxTransfer: number = 500;

    @(propRules.noLower(100) as any)
    minBalance: number = 100;

    @(propRules.watchSet<string>((_, __, val) => val.toUpperCase()) as any)
    username: string = "";

    _admin: boolean = false;

    @(propRules.onlyWhen(function (this: Account) {
        return this._admin;
    }) as any)
    sensitiveData: string = "";

    @(propRules.onlyTheClassAndSubCanWrite(class Temp {}) as any)
    protected _secret: string = "confidential";
}

class SubAccount extends Account {
    updateSecret(newVal: string) {
        this._secret = newVal; // 允许子类修改
    }
}

// 测试用例
const acc = new Account();
const subAcc = new SubAccount();

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

// 测试onlyTheClassAndSubCanWrite
console.log("原始_secret:", subAcc.updateSecret("initial secret")); // 通过方法访问
console.log("新_secret:", subAcc.updateSecret("updated secret"));
